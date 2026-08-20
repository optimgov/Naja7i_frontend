/**
 * LA FIXTURE DES OPPORTUNITÉS — lue une fois, partagée par deux routes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI ELLE SORT DU GESTIONNAIRE DE ROUTE
 *
 * `_donnees/opportunites.get.ts` la servait et la gardait pour lui. La
 * recherche globale a besoin du même corpus : recopier la lecture aurait donné
 * deux caches, deux chemins de fichier et deux occasions de diverger le jour où
 * le collecteur branchera — or ce jour-là, il ne doit y avoir QU'UN point de
 * lecture à changer, et c'est toute la raison d'être de cette indirection.
 *
 * `useStorage('assets:server')` ET NON `readFile` SUR UN CHEMIN RELATIF. Un
 * chemin construit depuis `import.meta.url` marche en développement et casse à
 * la compilation : le module se retrouve dans `.output/server/chunks/…` et le
 * `../..` ne désigne plus rien. Mesuré — 500 ENOENT sur la première exécution
 * du bundle, alors que `npm run dev` passait. `server/assets/` est justement
 * l'emplacement que Nitro embarque dans le bundle et expose par cette clé.
 */

/** Ce que le collecteur sert. Reproduit à la lettre — voir `docs/CONTRAT-EXPORT.md`. */
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

/**
 * Lu une fois par processus. Le jour où ce sera un appel au collecteur, ce
 * cache devra gagner une durée de vie — pas disparaître.
 */
export async function lireAnnonces(): Promise<AnnonceCollecteur[]> {
  if (cache) return cache

  const brut = await useStorage('assets:server').getItem<AnnonceCollecteur[] | string>(
    'annonces-2026-08-08.json',
  )

  if (brut === null || brut === undefined) {
    throw createError({ statusCode: 500, statusMessage: 'Fixture des opportunités introuvable' })
  }

  cache = typeof brut === 'string' ? JSON.parse(brut) as AnnonceCollecteur[] : brut

  return cache
}
