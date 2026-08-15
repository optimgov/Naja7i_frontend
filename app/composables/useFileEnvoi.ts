import { ApiRequestError } from './useApi'

/**
 * File d'envoi des écritures qui ne doivent pas se perdre.
 *
 * CE QU'ELLE PROTÈGE
 *
 * Une réponse à une question est un travail du candidat, pas un clic. Si le
 * réseau tombe, si la session expire, si l'onglet est fermé, cette réponse doit
 * survivre — sinon le candidat recommence, et il ne recommence pas : il
 * abandonne.
 *
 * POURQUOI C'EST SÛR DE REJOUER
 *
 * `PUT …/items/{uuid}` est rejouable sans effet de bord, le contrat le
 * garantit. C'est cette propriété — et elle seule — qui autorise à réémettre.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX DÉFAUTS CORRIGÉS ICI, TOUS DEUX MESURÉS AVANT DE L'ÊTRE
 *
 * BLOC-4 — La file n'avait ni propriétaire ni coordination entre onglets.
 *
 *   Clé globale fixe, sans identifiant de candidat, et un cycle
 *   lecture-en-mémoire puis réécriture COMPLÈTE du tableau. Deux onglets hors
 *   connexion s'écrasaient mutuellement. Pire : une reconnexion sous un AUTRE
 *   compte écoulait la file du précédent — les réponses partaient sous la
 *   mauvaise identité, recevaient 404, et le chemin du BLOC-5 les supprimait.
 *
 *   La file porte donc une ENVELOPPE `{ownerUserUuid, version, entries}`, elle
 *   REFUSE d'écouler sous un autre utilisateur, et toute mutation passe par un
 *   verrou inter-onglets (Web Locks, à défaut fusion sur événement `storage`).
 *   La relecture se fait DANS le verrou : l'état du stockage fait foi, jamais
 *   la copie en mémoire.
 *
 * BLOC-5 — Un refus définitif était supprimé en silence, puis la série soumise.
 *
 *   Un 422, 409 ou 404 retirait l'entrée sans rien signaler, au motif que
 *   « l'appelant a déjà reçu l'erreur ». C'est FAUX pour une entrée créée hors
 *   connexion : son premier échange avec le serveur a lieu ici, pendant
 *   `ecouler()`. Personne n'avait donc jamais vu cette erreur.
 *
 *   CONSÉQUENCE MESURÉE, avant correction : une réponse jetée par le client
 *   fait compter la question comme SAUTÉE côté serveur — `skipped_count` passe
 *   de 0 à 1 sur le domaine concerné. Ce compteur nourrit `RemediationPlanner`,
 *   qui remonte le domaine et finit par lui attribuer le motif
 *   « questions_sautees ». Le candidat avait répondu ; le produit lui reproche
 *   d'avoir évité la question.
 *
 *   Trois états donc — `envoye`, `a_reessayer`, `refuse` — et SEUL un 2xx
 *   retire une entrée. Un refus reste dans une boîte d'échec explicite, BLOQUE
 *   la soumission, et se présente au candidat avec l'item concerné.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type EtatEnvoi = 'a_reessayer' | 'refuse'

export interface EnvoiEnAttente {
  /**
   * Identifiant STABLE, indispensable à la fusion entre onglets : deux onglets
   * qui répondent à la même question produisent la même entrée, et la plus
   * récente l'emporte au lieu de la dupliquer. Le chemin de la ressource joue
   * ce rôle — c'est aussi la clé de dédoublonnage.
   */
  id: string
  chemin: string
  corps: unknown
  pose: number
  etat: EtatEnvoi
  tentatives: number
  /** Renseigné seulement en `refuse`. */
  refus?: { code: string; message: string; statut: number }
  /** De quoi montrer au candidat CE qui a été refusé. */
  repere?: { attemptUuid: string; itemUuid: string; position?: number }
}

interface Enveloppe {
  /** `null` seulement pour une file écrite avant que l'identité soit connue. */
  ownerUserUuid: string | null
  version: number
  entries: EnvoiEnAttente[]
}

const CLE_STOCKAGE = 'naja7i.file-envoi'
const VERSION = 2
const VERROU = 'naja7i.file-envoi.verrou'

const ENVELOPPE_VIDE: Enveloppe = { ownerUserUuid: null, version: VERSION, entries: [] }

/**
 * LE CHEMIN CANONIQUE D'UNE RÉPONSE PORTE DÉJÀ LE REPÈRE — audit t4, BLOC-FRONT-1.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE LE CORRECTIF DU BLOC-4 NE COUVRAIT PAS
 *
 * Le verrou de soumission reconnaît une entrée par `repere.attemptUuid`. Or la
 * v1 de cette file était un TABLEAU NU de `{chemin, corps}` : sa migration ne
 * pouvait pas inventer de repère, et n'en posait donc aucun. Cette version en
 * a elle-même écrit sans, chaque fois que `poser()` était appelé à deux
 * arguments.
 *
 * Une entrée sans repère était INVISIBLE au verrou. Mesuré avant correction :
 * le PUT échoue, `resteAAcquitter` rend `[]`, le POST de soumission part quand
 * même, et le rejeu suivant reçoit `ATTEMPT_CLOSED`. La réponse est perdue et
 * le serveur compte la question comme SAUTÉE — le dommage exact que D-F36
 * promet d'empêcher, sur exactement la population qu'il vise : le candidat déjà
 * en passation au moment du déploiement.
 *
 * ON NE DEVINE RIEN : `/me/attempts/{attemptUuid}/items/{itemUuid}` contient
 * les deux identifiants. Le repère n'était pas absent de l'entrée, il était
 * absent du CHAMP — il a toujours été dans le chemin, qui est aussi son
 * identité stable.
 *
 * Reconstruit À LA LECTURE, donc pour les files déjà écrites sur les postes :
 * un correctif qui n'agirait qu'à l'écriture laisserait sans protection
 * précisément ceux qui en ont besoin aujourd'hui.
 */
const CHEMIN_REPONSE = /^\/me\/attempts\/([^/]+)\/items\/([^/]+)$/

function repereDepuisChemin(chemin: unknown): EnvoiEnAttente['repere'] | undefined {
  if (typeof chemin !== 'string') return undefined

  const trouve = CHEMIN_REPONSE.exec(chemin)
  if (!trouve) return undefined

  return { attemptUuid: trouve[1]!, itemUuid: trouve[2]! }
}

/** Complète une entrée lue : le repère du champ, sinon celui du chemin. */
function avecRepere(e: EnvoiEnAttente): EnvoiEnAttente {
  return e.repere?.attemptUuid ? e : { ...e, repere: repereDepuisChemin(e.chemin) }
}

function lireEnveloppe(): Enveloppe {
  if (import.meta.server) return { ...ENVELOPPE_VIDE }
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE)
    if (!brut) return { ...ENVELOPPE_VIDE }
    const lu: unknown = JSON.parse(brut)

    /* Migration silencieuse depuis la version 1, qui était un tableau nu sans
     * propriétaire. On ne peut pas lui en inventer un : `null` signifie « à
     * adopter par le premier utilisateur identifié », ce qui préserve les
     * réponses d'un candidat déjà en cours de passation au moment du déploiement. */
    if (Array.isArray(lu)) {
      return {
        ownerUserUuid: null,
        version: VERSION,
        entries: (lu as Array<{ chemin: string; corps: unknown; pose?: number }>).map((e) => ({
          id: e.chemin,
          chemin: e.chemin,
          corps: e.corps,
          pose: e.pose ?? Date.now(),
          etat: 'a_reessayer' as const,
          tentatives: 0,
          /* Le repère vient du chemin — voir `repereDepuisChemin`. Sans lui,
           * ces entrées migrées ne bloquaient aucune soumission. */
          repere: repereDepuisChemin(e.chemin),
        })),
      }
    }

    const env = lu as Partial<Enveloppe>
    return {
      ownerUserUuid: env.ownerUserUuid ?? null,
      version: VERSION,
      /* MÊME TRAITEMENT POUR LES ENVELOPPES v2 DÉJÀ ÉCRITES. Le défaut ne vient
       * pas seulement de la v1 : cette version a posé des entrées sans repère
       * chaque fois que `poser()` a été appelé sans son troisième argument. */
      entries: Array.isArray(env.entries) ? env.entries.map(avecRepere) : [],
    }
  } catch {
    // Stockage illisible ou refusé (navigation privée stricte) : la file
    // fonctionne en mémoire. On ne fait pas échouer la passation pour ça.
    return { ...ENVELOPPE_VIDE }
  }
}

function ecrireEnveloppe(env: Enveloppe): void {
  if (import.meta.server) return
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify({ ...env, version: VERSION }))
  } catch {
    /* voir ci-dessus */
  }
}

/**
 * Sérialise les mutations entre onglets.
 *
 * Web Locks quand il existe : c'est un verrou réel, tenu par le navigateur,
 * et il couvre aussi les onglets d'un autre processus de rendu. À défaut, un
 * mutex de page — il ne protège que l'onglet courant, mais la fusion par
 * identifiant stable rattrape le reste (deux écritures concurrentes se
 * réconcilient au lieu de s'écraser).
 */
let chaine: Promise<unknown> = Promise.resolve()

async function avecVerrou<T>(operation: () => T | Promise<T>): Promise<T> {
  if (import.meta.server) return await operation()

  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (locks?.request) {
    return (await locks.request(VERROU, async () => await operation())) as T
  }

  const suivant = chaine.then(operation, operation)
  chaine = suivant.catch(() => undefined)
  return (await suivant) as T
}

export function useFileEnvoi() {
  const api = useApi()
  const reseau = useReseau()
  const { user } = useAuth()

  const file = useState<EnvoiEnAttente[]>('file.envoi', () => [])
  const proprietaire = useState<string | null>('file.proprietaire', () => null)
  const reauthRequise = useState<boolean>('file.reauth', () => false)
  const enCours = useState<boolean>('file.enCours', () => false)

  const enAttente = computed(() => file.value.filter((e) => e.etat === 'a_reessayer').length)
  const refuses = computed(() => file.value.filter((e) => e.etat === 'refuse'))

  /**
   * Vrai quand la file appartient à quelqu'un d'autre que l'utilisateur
   * connecté. Elle n'est alors NI écoulée NI purgée : ces réponses appartiennent
   * à leur auteur, et lui seul peut les faire partir.
   */
  const proprietaireAutre = computed(
    () =>
      proprietaire.value !== null &&
      user.value !== null &&
      proprietaire.value !== user.value.uuid &&
      file.value.length > 0,
  )

  /** La soumission est bloquée tant qu'un refus n'a pas été vu. */
  const soumissionBloquee = computed(() => refuses.value.length > 0)

  /**
   * Ce qui reste à acquitter POUR UNE TENTATIVE DONNÉE — audit tournée 3, BLOC-4.
   *
   * Le verrou de soumission ne regardait que les refus DÉFINITIFS. Une entrée
   * `a_reessayer` — un PUT coupé par le réseau — n'y entrait pas : `ecouler()`
   * rendait la main, `soumettre()` fermait la tentative, et le rejeu suivant
   * recevait `ATTEMPT_CLOSED`. La réponse devenait alors définitivement
   * refusée, et le serveur comptait la question comme SAUTÉE.
   *
   * C'est exactement le dommage que le BLOC-5 disait interdire — son verrou ne
   * couvrait simplement pas cet état-là.
   *
   * PAR TENTATIVE, et non globalement : une réponse en attente sur une AUTRE
   * série ne doit pas empêcher de rendre celle-ci. Le repère porte déjà
   * `attemptUuid`, il n'y a rien à deviner.
   */
  function resteAAcquitter(attemptUuid: string): EnvoiEnAttente[] {
    /* TOUTE entrée encore en file est non acquittée : une réponse acceptée par
     * le serveur en SORT (`muter(id, () => null)`), elle n'y reste pas dans un
     * état « envoyé ». Le filtre porte donc sur la seule tentative — et c'est
     * aussi ce qui rend la règle simple à énoncer : file vide pour cette série,
     * ou soumission refusée. */
    return file.value.filter((e) => {
      const rattachee = e.repere?.attemptUuid

      /*
       * UNE ENTRÉE IMPOSSIBLE À RATTACHER BLOQUE — audit t4, BLOC-FRONT-1.
       *
       * Le repère est reconstruit depuis le chemin à la lecture ; il ne reste
       * donc `undefined` que pour une entrée dont le chemin n'a pas la forme
       * canonique — stockage corrompu, écriture d'une version future, main
       * humaine. Le doute doit se résoudre du côté du candidat : bloquer
       * demande de patienter, laisser passer PERD sa réponse et la fait
       * compter comme sautée.
       *
       * L'asymétrie des conséquences décide, pas la vraisemblance du cas.
       */
      if (rattachee === undefined) return true

      return rattachee === attemptUuid
    })
  }

  function rafraichir(): void {
    const env = lireEnveloppe()
    proprietaire.value = env.ownerUserUuid
    file.value = env.entries
  }

  /** Recharge la file persistée et écoute les autres onglets. */
  function reprendre(): void {
    if (import.meta.server) return
    rafraichir()

    const surStockage = (e: StorageEvent) => {
      if (e.key === CLE_STOCKAGE) rafraichir()
    }
    window.addEventListener('storage', surStockage)
    onScopeDispose(() => window.removeEventListener('storage', surStockage))
  }

  async function poser(
    chemin: string,
    corps: unknown,
    repere?: EnvoiEnAttente['repere'],
  ): Promise<void> {
    await avecVerrou(() => {
      /* Relecture DANS le verrou : c'est le stockage qui fait foi. L'ancienne
       * version réécrivait le tableau qu'elle avait en mémoire, et perdait donc
       * tout ce qu'un autre onglet avait posé entre-temps. */
      const env = lireEnveloppe()

      const proprietaireCourant = env.ownerUserUuid ?? user.value?.uuid ?? null
      const reste = env.entries.filter((e) => e.id !== chemin)

      const nouvelle: EnvoiEnAttente = {
        id: chemin,
        chemin,
        corps,
        pose: Date.now(),
        etat: 'a_reessayer',
        tentatives: 0,
        /* L'appelant donne le repère RICHE — il connaît la position, utile pour
         * montrer au candidat CE qui a échoué. À défaut, le chemin le porte
         * déjà : une entrée écrite ici n'est jamais sans repère. */
        repere: repere ?? repereDepuisChemin(chemin),
      }

      const enveloppe: Enveloppe = {
        ownerUserUuid: proprietaireCourant,
        version: VERSION,
        entries: [...reste, nouvelle].sort((a, b) => a.pose - b.pose),
      }

      ecrireEnveloppe(enveloppe)
      proprietaire.value = enveloppe.ownerUserUuid
      file.value = enveloppe.entries
    })
  }

  /** Remplace une entrée dans le stockage, sous verrou. */
  async function muter(id: string, transforme: (e: EnvoiEnAttente) => EnvoiEnAttente | null): Promise<void> {
    await avecVerrou(() => {
      const env = lireEnveloppe()
      const entries: EnvoiEnAttente[] = []

      for (const e of env.entries) {
        if (e.id !== id) {
          entries.push(e)
          continue
        }
        const suite = transforme(e)
        if (suite) entries.push(suite)
      }

      const enveloppe: Enveloppe = { ...env, version: VERSION, entries }
      ecrireEnveloppe(enveloppe)
      file.value = enveloppe.entries
    })
  }

  /**
   * Tente d'écouler la file, dans l'ordre de pose.
   *
   * S'arrête à la première difficulté RÉSEAU ou d'authentification : si le
   * réseau est coupé, insister sur les suivants ne fait qu'allonger l'attente ;
   * si la session a expiré, tous échoueront pareil.
   *
   * Un REFUS DÉFINITIF, lui, ne bloque pas les suivants — il est marqué et la
   * file continue. Il reste dans la boîte d'échec jusqu'à ce que le candidat
   * l'ait vu.
   */
  /**
   * Le résultat d'une vidange, ÉNONCÉ plutôt que déduit d'états globaux.
   *
   * L'appelant ne doit pas avoir à recouper `enAttente`, `refuses` et
   * `reauthRequise` pour savoir si la file est réellement vide : c'est ce
   * recoupement manquant qui a laissé passer le BLOC-4.
   */
  async function ecouler(): Promise<number> {
    if (import.meta.server || enCours.value) return 0
    if (reauthRequise.value) return 0

    /* La file appartient à quelqu'un d'autre : on n'envoie RIEN. Émettre sous
     * l'identité courante ferait répondre 404 au serveur, et l'ancien code
     * aurait alors supprimé les réponses d'un autre candidat. */
    if (proprietaireAutre.value) return 0

    enCours.value = true
    let passes = 0

    try {
      for (;;) {
        rafraichir()
        const premier = file.value.find((e) => e.etat === 'a_reessayer')
        if (!premier) break

        try {
          await api.put(premier.chemin, premier.corps)
          // SEUL un 2xx retire une entrée.
          await muter(premier.id, () => null)
          reseau.signalerSucces()
          passes += 1
        } catch (e: unknown) {
          if (e instanceof ApiRequestError && e.status === 401) {
            reauthRequise.value = true
            break
          }

          if (e instanceof ApiRequestError && e.error.code === 'NETWORK_ERROR') {
            await muter(premier.id, (x) => ({ ...x, tentatives: x.tentatives + 1 }))
            reseau.signalerEchec()
            break
          }

          /*
           * Refus définitif (422, 409, 404…). Rejouer ne changera rien, mais
           * SUPPRIMER perdrait la réponse sans que personne l'ait vue — c'est
           * le BLOC-5. L'entrée passe en `refuse`, reste en file, et bloque la
           * soumission jusqu'à ce que le candidat en prenne connaissance.
           */
          const erreur = e instanceof ApiRequestError ? e : null
          await muter(premier.id, (x) => ({
            ...x,
            etat: 'refuse',
            tentatives: x.tentatives + 1,
            refus: {
              code: erreur?.error.code ?? 'UNKNOWN',
              message: erreur?.message ?? '',
              statut: erreur?.status ?? 0,
            },
          }))
        }
      }
    } finally {
      enCours.value = false
    }

    return passes
  }

  /** Après une ré-authentification réussie : la file reprend là où elle en était. */
  async function reprendreApresAuth(): Promise<number> {
    reauthRequise.value = false
    rafraichir()
    return await ecouler()
  }

  /**
   * Le candidat a pris connaissance d'un refus. L'entrée sort — c'est le SEUL
   * chemin de suppression d'une entrée non envoyée, et il passe par un geste
   * humain.
   */
  async function acquitterRefus(id: string): Promise<void> {
    await muter(id, () => null)
  }

  /**
   * Adopte une file orpheline (migrée de la v1) ou confirme le propriétaire.
   * Appelé après connexion, quand l'identité est enfin connue.
   */
  async function adopter(): Promise<void> {
    if (!user.value) return
    await avecVerrou(() => {
      const env = lireEnveloppe()
      if (env.ownerUserUuid !== null) return
      const enveloppe: Enveloppe = { ...env, ownerUserUuid: user.value!.uuid, version: VERSION }
      ecrireEnveloppe(enveloppe)
      proprietaire.value = enveloppe.ownerUserUuid
    })
  }

  return {
    file,
    enAttente,
    refuses,
    proprietaire,
    proprietaireAutre,
    soumissionBloquee,
    resteAAcquitter,
    reauthRequise,
    reprendre,
    rafraichir,
    poser,
    ecouler,
    reprendreApresAuth,
    acquitterRefus,
    adopter,
  }
}
