/**
 * Les opportunités — FIXTURE, servie par le BFF depuis un fichier.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE ROUTE EXISTE, ET CE QU'ELLE DEVIENDRA
 *
 * Le module Opportunités se construit dans un autre dépôt. Le CONTRAT DE
 * DONNÉES est déjà celui du collecteur — les 29 annonces du 8 août 2026 en
 * sont une capture réelle, pas un jeu inventé. Il n'y a donc rien à réécrire
 * au branchement : seul le POINT DE LECTURE change, ce `readFile` devenant un
 * appel au collecteur.
 *
 * Elle n'est pas sous `/api/`, et ce n'est pas un détail : `server/routes/api/
 * [...].ts` relaie TOUT ce préfixe vers Laravel. Une route de fixture posée là
 * serait tantôt servie, tantôt relayée, selon l'ordre de résolution de Nitro —
 * exactement le genre de panne qu'on ne diagnostique pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `jours` EST RECALCULÉ ICI, ET C'EST LA DÉCISION QUI COMPTE
 *
 * Le collecteur sert un champ `jours` — un nombre de jours jusqu'à l'échéance,
 * calculé À L'INSTANT DE LA COLLECTE. C'est une valeur PÉRISSABLE, et la
 * fixture le démontre : capturée le 8 août, elle annonce encore ouvertes trois
 * annonces dont l'échéance est passée depuis. L'une d'elles est le concours de
 * professeur des écoles — celui que le plus de candidats attendent.
 *
 * Afficher « Clôture dans 1 jour » sur un dépôt fermé depuis cinq jours n'est
 * pas une imprécision d'affichage : c'est la seule erreur de ce produit qui
 * puisse coûter à un candidat sa candidature. On recalcule donc depuis
 * `deadline`, qui est une DATE et ne périme pas.
 *
 * La forme rendue est inchangée — le client lit toujours `jours`. Quand le
 * collecteur branchera, ce recalcul restera utile : il transforme une donnée
 * fraîche à la collecte en donnée fraîche à la LECTURE, et l'écart entre les
 * deux est exactement le temps qu'une annonce passe en cache.
 */

/** Ce que le collecteur sert. Reproduit à la lettre — voir l'en-tête. */
export interface AnnonceCollecteur {
  id: string
  slug: string
  type: string
  stage: string
  titre: string
  resume: string
  org: string
  org_type: string
  ref: string | null
  grade: string | null
  echelle: string | null
  specialites: string[]
  postes: number | null
  regions: string[]
  deadline: string | null
  jours: number | null
  exam: string | null
  publie: string
  mode: string
  url: string
  diplomes: string[]
  age: number | null
  docs: { label: string, url: string, mime: string, mirrored: boolean }[]
  source: { nom: string, url: string, fetched: string, officiel: boolean }
  naja7i: {
    filiere: string | null
    prep_slug: string | null
    has_prep: boolean
    match_reason: string | null
    confidence: number
  }
  revision: number
}

let cache: AnnonceCollecteur[] | null = null

async function lire(): Promise<AnnonceCollecteur[]> {
  if (cache) return cache

  /*
   * `useStorage('assets:server')` ET NON `readFile` SUR UN CHEMIN RELATIF.
   *
   * Un chemin construit depuis `import.meta.url` marche en développement et
   * casse à la compilation : le module se retrouve dans
   * `.output/server/chunks/routes/…`, et le `../..` ne désigne plus rien.
   * Mesuré — 500 ENOENT sur la première exécution du bundle, alors que `npm
   * run dev` passait.
   *
   * `server/assets/` est justement l'emplacement que Nitro embarque dans le
   * bundle et expose par cette clé. Le fichier voyage avec le serveur.
   *
   * Lu une fois par processus. Le jour où ce sera un appel au collecteur, ce
   * cache devra gagner une durée de vie — pas disparaître.
   */
  const brut = await useStorage('assets:server').getItem<AnnonceCollecteur[] | string>(
    'annonces-2026-08-08.json',
  )

  if (brut === null || brut === undefined) {
    throw createError({ statusCode: 500, statusMessage: 'Fixture des opportunités introuvable' })
  }

  cache = typeof brut === 'string' ? JSON.parse(brut) as AnnonceCollecteur[] : brut

  return cache
}

/*
 * `joursRestants` VIT DANS `server/utils/echeance.ts` — audit t4, BLOC-ZP1-1.
 *
 * Il était ici, et il comptait en dates civiles UTC : à 16h31 à Casablanca une
 * annonce close à 16h30 restait ouverte jusqu'à 01h00, et à 00h30 « demain »
 * s'affichait « dans 2 jours ». Le commentaire prétendait pourtant compter
 * « dans le fuseau du candidat » — aucun fuseau n'était déclaré nulle part.
 *
 * Déplacé pour une raison de fond : un décompte ne se prouve qu'aux FRONTIÈRES
 * de journée, donc avec une horloge injectable. Tant que la fonction vivait
 * dans un gestionnaire de route, elle n'était atteignable qu'à l'heure qu'il
 * est — et vingt-trois heures sur vingt-quatre, tout allait bien.
 *
 * Nitro l'auto-importe depuis `server/utils/`. `scripts/verifier-echeances.mjs`
 * l'éprouve aux deux minutes qui comptent, et sous deux fuseaux d'hôte.
 */

export default defineEventHandler(async (event) => {
  const annonces = (await lire()).map(a => ({ ...a, jours: joursRestants(a.deadline) }))

  /* `no-store` : `jours` est calculé à l'instant de la réponse. Mise en cache,
   * elle rendrait un décompte faux — et d'autant plus faux qu'elle serait
   * gardée longtemps. Même raison que `seconds_remaining` sur une tentative. */
  setResponseHeader(event, 'cache-control', 'no-store')

  return {
    data: annonces,
    meta: {
      /* MARQUÉ COMME FIXTURE, et le marqueur est CONTRACTUEL : l'interface
       * l'affiche, et si le serveur cesse un jour de le servir, la mention
       * disparaît de l'écran — elle ne se replie pas sur une valeur en dur.
       * C'est la règle « aucun repli en dur sur un marqueur contractuel ». */
      fixture: true,
      /* LE FUSEAU EST DIT, parce que `jours` n'a de sens que rapporté à une
       * horloge. Un client — ou une recette — qui recalculerait sans le savoir
       * poserait une seconde vérité, et c'est exactement ce qui a laissé passer
       * le BLOC-ZP1-1 : les deux côtés se trompaient ensemble. */
      timezone_candidat: TIMEZONE_CANDIDAT,
      collecte: '2026-08-08T10:00:00+01:00',
      source: 'Portail de l’emploi public (MMSP) — capture du 8 août 2026',
      total: annonces.length,
    },
  }
})
