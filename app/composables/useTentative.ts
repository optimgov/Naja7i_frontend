import { ApiRequestError } from './useApi'

/**
 * Passation d'un diagnostic.
 *
 * LA RÈGLE QUI GOUVERNE CE FICHIER
 *
 * La passation ne connaît JAMAIS la correction. `AttemptQuestionResource` est
 * une liste blanche stricte : ni `is_correct`, ni `rationale`, ni `cause`. Les
 * types ci-dessous la reproduisent à la lettre — non par élégance, mais parce
 * qu'un type est une garde : si un jour le serveur se mettait à servir
 * `is_correct` pendant la passation, aucun écran ne pourrait l'afficher sans
 * que le typage devienne rouge.
 *
 * On ne demande donc rien d'autre, on ne met rien en cache, on ne précharge
 * pas la correction — pas même « pour aller plus vite à l'écran suivant ».
 */

export type Certitude = 'sure' | 'hesitant' | 'guess'

/** Liste blanche stricte : tout ce que la passation a le droit de voir. */
export interface OptionDeQuestion {
  uuid: string
  position: number
  content: string
}

export interface QuestionEnPassation {
  uuid: string
  stem: string
  kind: string
  options: OptionDeQuestion[]
}

export interface ItemDeTentative {
  item_uuid: string
  position: number
  question: QuestionEnPassation
  answered: boolean
  confidence: Certitude | null
  selected_option_uuid: string | null
}

export interface Tentative {
  uuid: string
  kind: string
  status: string
  locale: string
  item_count: number
  answered_count: number
  /** Absent tant que la tentative est en cours — et c'est voulu. */
  correct_count?: number
  started_at: string
  submitted_at: string | null
  seconds_remaining: number | null
  exam: { code: string; name: string; coefficient: number | null }
  items: ItemDeTentative[]
}

/** Ce que rend le PUT : l'avancement, jamais la correction. */
interface Avancement {
  answered_count?: number
  item_count?: number
  seconds_remaining?: number | null
}

/**
 * Ce que le serveur dit d'une série d'ENTRAÎNEMENT en la servant.
 *
 * `short_of_scope` est le champ qui compte. Le serveur sert parfois moins que
 * demandé quand le périmètre est mince — il ne complète JAMAIS hors périmètre,
 * la série est simplement plus courte. Taire l'écart ferait croire au candidat
 * qu'il a reçu une série complète, et fausserait sa lecture du résultat.
 */
export interface MetaEntrainement {
  requested: number
  served: number
  short_of_scope: boolean
  available_in_scope: number
  /** Questions déjà réussies, resservies faute de vivier neuf. */
  already_mastered_reused: number
}

const CLE_IDEMPOTENCE = 'naja7i.idempotence.diagnostic'

export function useTentative() {
  const api = useApi()
  const file = useFileEnvoi()
  const reseau = useReseau()
  // Résolu ici, comme dans `useApi` : après le premier `await`, le contexte
  // Nuxt n'est plus actif et `useNuxtApp()` lèverait.
  const { $i18n } = useNuxtApp()

  const tentative = useState<Tentative | null>('tentative.courante', () => null)
  const chargement = ref(false)
  const erreur = ref<ApiRequestError | null>(null)

  /*
   * RESYNCHRONISATION DU TEMPS
   *
   * `seconds_remaining` vient du serveur. Le client ne décompte que pour
   * l'affichage, et jamais pour décider : un poste dont l'horloge avance de
   * trois minutes ne doit pas fermer la tentative trois minutes trop tôt, et
   * un poste retardé ne doit pas offrir de rab.
   *
   * On mémorise donc le couple (valeur serveur, instant local de réception) et
   * on affiche la différence. À chaque réponse, le serveur renvoie une valeur
   * fraîche et la dérive est effacée.
   */
  const ancre = useState<{ secondes: number; recuA: number } | null>('tentative.ancre', () => null)
  const maintenant = ref(Date.now())
  let battement: ReturnType<typeof setInterval> | null = null

  const secondesRestantes = computed<number | null>(() => {
    if (!ancre.value) return null
    const ecoule = Math.floor((maintenant.value - ancre.value.recuA) / 1000)
    return Math.max(0, ancre.value.secondes - ecoule)
  })

  /** Vrai quand le serveur a dit zéro. Le client ne conclut jamais seul. */
  const tempsEcoule = computed(() => secondesRestantes.value === 0)

  function ancrerTemps(secondes: number | null | undefined): void {
    if (secondes === null || secondes === undefined) return
    ancre.value = { secondes, recuA: Date.now() }
  }

  function demarrerBattement(): void {
    if (import.meta.server || battement) return
    battement = setInterval(() => {
      maintenant.value = Date.now()
    }, 1000)
    onScopeDispose(() => {
      if (battement) clearInterval(battement)
      battement = null
    })
  }

  /**
   * Clé d'idempotence, stable par épreuve et par onglet.
   *
   * C'est elle qui empêche un double clic sur « lancer » d'ouvrir deux
   * tentatives. Elle vit dans `sessionStorage` : deux onglets sont deux
   * intentions distinctes, un rechargement est la même.
   */
  function cleIdempotence(portee: string): string {
    const cle = `${CLE_IDEMPOTENCE}.${portee}`
    if (import.meta.server) return cle

    try {
      const existante = sessionStorage.getItem(cle)
      if (existante) return existante
      const neuve = crypto.randomUUID()
      sessionStorage.setItem(cle, neuve)
      return neuve
    } catch {
      // Stockage refusé : la clé reste stable le temps de la page, ce qui
      // couvre déjà le double clic — le cas qu'elle sert à empêcher.
      return cle
    }
  }

  /**
   * Ouvre un diagnostic, ou rend celui qui est déjà en cours.
   *
   * Le serveur tranche : 201 s'il en crée un, 200 s'il rend l'existant. Le
   * client ne demande pas « y a-t-il une tentative en cours ? » avant — la
   * question et la réponse se croiseraient, et deux candidats pressés
   * ouvriraient deux tentatives.
   */
  async function ouvrir(codeEpreuve: string, total?: number): Promise<Tentative> {
    chargement.value = true
    erreur.value = null

    try {
      const reponse = await api.post<{ data: Tentative }>(
        `/me/diagnostics/${encodeURIComponent(codeEpreuve)}`,
        total === undefined ? {} : { total },
        { 'Idempotency-Key': cleIdempotence(codeEpreuve) },
      )
      tentative.value = reponse.data
      ancrerTemps(reponse.data.seconds_remaining)
      return reponse.data
    } catch (e: unknown) {
      if (e instanceof ApiRequestError) erreur.value = e
      throw e
    } finally {
      chargement.value = false
    }
  }

  /**
   * Ouvre une série d'ENTRAÎNEMENT ciblé.
   *
   * Même patron que `ouvrir` — clé d'idempotence, le serveur tranche entre
   * création et reprise — à deux différences près :
   *
   *  - un domaine peut être visé (`node_uuid`), ou laissé au serveur, qui le
   *    choisit alors d'après l'ordonnance ;
   *  - la réponse porte un `meta` que l'appelant DOIT montrer quand
   *    `short_of_scope` est vrai. Il est donc rendu, pas avalé.
   *
   * La clé est distincte de celle du diagnostic : rejouer la clé d'un
   * diagnostic pour ouvrir un entraînement est refusé par le serveur depuis
   * l'empreinte d'idempotence, et ce serait de toute façon une autre intention.
   */
  async function ouvrirEntrainement(
    codeEpreuve: string,
    options: { nodeUuid?: string | null; total?: number } = {},
  ): Promise<{ tentative: Tentative; meta: MetaEntrainement }> {
    chargement.value = true
    erreur.value = null

    const corps: Record<string, unknown> = {}
    if (options.nodeUuid) corps.node_uuid = options.nodeUuid
    if (options.total !== undefined) corps.total = options.total

    try {
      const reponse = await api.post<{ data: Tentative; meta: MetaEntrainement }>(
        `/me/training/${encodeURIComponent(codeEpreuve)}`,
        corps,
        { 'Idempotency-Key': cleIdempotence(`entrainement.${codeEpreuve}.${options.nodeUuid ?? 'auto'}`) },
      )
      tentative.value = reponse.data
      ancrerTemps(reponse.data.seconds_remaining)
      return { tentative: reponse.data, meta: reponse.meta }
    } catch (e: unknown) {
      if (e instanceof ApiRequestError) erreur.value = e
      throw e
    } finally {
      chargement.value = false
    }
  }

  async function charger(uuid: string): Promise<Tentative> {
    chargement.value = true
    erreur.value = null

    try {
      const reponse = await api.get<{ data: Tentative }>(`/me/attempts/${uuid}`)
      tentative.value = reponse.data
      ancrerTemps(reponse.data.seconds_remaining)
      demarrerBattement()
      return reponse.data
    } catch (e: unknown) {
      if (e instanceof ApiRequestError) erreur.value = e
      throw e
    } finally {
      chargement.value = false
    }
  }

  /**
   * Enregistre une réponse.
   *
   * `confidence` est REQUIS par l'API, et ce n'est pas une exigence de forme :
   * c'est le champ qui rend possibles « erreur avec certitude » et « réussite
   * au hasard » dans l'ordonnance. Une interface qui le rendrait facultatif
   * viderait la moitié du diagnostic. La signature l'impose donc aussi.
   *
   * En cas de coupure, la réponse part en file et sera rejouée : le PUT est
   * rejouable sans effet de bord, le contrat le garantit. L'état local est mis
   * à jour dans tous les cas — le candidat voit sa réponse prise en compte,
   * parce qu'elle l'est réellement, ici puis chez le serveur.
   */
  async function repondre(
    itemUuid: string,
    optionUuid: string | null,
    certitude: Certitude,
    msEcoules: number,
  ): Promise<void> {
    const courante = tentative.value
    if (!courante) throw new Error('Aucune tentative chargée.')

    const chemin = `/me/attempts/${courante.uuid}/items/${itemUuid}`
    const corps = {
      option_uuid: optionUuid,
      confidence: certitude,
      elapsed_ms: msEcoules,
      client_reported_at: new Date().toISOString(),
    }

    // Mise à jour locale d'abord : l'écran ne doit pas attendre le réseau pour
    // montrer que la réponse est prise.
    const item = courante.items.find((i) => i.item_uuid === itemUuid)
    if (item) {
      const nouvelle = !item.answered
      item.answered = true
      item.confidence = certitude
      item.selected_option_uuid = optionUuid
      if (nouvelle) courante.answered_count += 1
    }

    try {
      const avancement = await api.put<{ data?: Avancement } & Avancement>(chemin, corps)
      const donnees = (avancement.data ?? avancement) as Avancement

      if (typeof donnees.answered_count === 'number') courante.answered_count = donnees.answered_count
      ancrerTemps(donnees.seconds_remaining)
      reseau.signalerSucces()
    } catch (e: unknown) {
      const repere = { attemptUuid: courante.uuid, itemUuid, position: item?.position }

      if (e instanceof ApiRequestError && e.status === 401) {
        // Session expirée : la réponse est mise en file, la reprise se fait
        // sur place et la file repart. Rien n'est perdu.
        await file.poser(chemin, corps, repere)
        file.reauthRequise.value = true
        return
      }

      if (e instanceof ApiRequestError && e.error.code === 'NETWORK_ERROR') {
        await file.poser(chemin, corps, repere)
        reseau.signalerEchec()
        return
      }

      throw e
    }
  }

  async function soumettre(): Promise<void> {
    const courante = tentative.value
    if (!courante) throw new Error('Aucune tentative chargée.')

    // La file d'abord : soumettre en laissant des réponses en attente les
    // perdrait, le serveur figeant la tentative.
    await file.ecouler()

    /*
     * BLOC-5 — On ne soumet PAS tant qu'un refus n'a pas été vu.
     *
     * Soumettre par-dessus une réponse refusée fige la série en comptant la
     * question comme SAUTÉE : mesuré, `skipped_count` passe de 0 à 1, et ce
     * compteur remonte le domaine dans l'ordonnance avec le motif
     * « questions_sautees ». Le candidat avait répondu — on ne lui reproche pas
     * une esquive qu'il n'a pas commise.
     */
    if (file.soumissionBloquee.value) {
      throw new ApiRequestError(0, {
        code: 'FILE_ENVOI_REFUS',
        message: $i18n.t('file.refus_bloque'),
        request_id: '',
      })
    }

    await api.post(`/me/attempts/${courante.uuid}/submit`)
    await charger(courante.uuid)
  }

  return {
    tentative,
    chargement,
    erreur,
    secondesRestantes,
    tempsEcoule,
    ouvrir,
    ouvrirEntrainement,
    charger,
    repondre,
    soumettre,
    demarrerBattement,
  }
}
