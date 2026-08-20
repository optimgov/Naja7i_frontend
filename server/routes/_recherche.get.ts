/**
 * LA RECHERCHE GLOBALE — agrégation transitoire, derrière UNE route serveur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI ELLE VIT ICI, ET PAS DANS UN COMPOSANT
 *
 * Il n'existe aucun point d'entrée unifié côté Laravel : le catalogue sert les
 * filières et leurs familles, la fiche de famille sert les spécialités, et les
 * opportunités viennent d'une fixture servie par ce même BFF. Un composant qui
 * agrégerait tout cela lancerait N appels concurrents à chaque frappe, et il
 * CONNAÎTRAIT l'origine temporaire des opportunités — c'est-à-dire qu'il
 * faudrait le réécrire le jour où le collecteur branchera.
 *
 * Ici, l'agrégation est un détail de serveur. Le client pose une question et
 * reçoit des résultats ; le jour où Laravel sert une recherche, cette route
 * devient un relais et AUCUN composant ne bouge.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * L'INDEX EST MIS EN CACHE, PAS LES RÉSULTATS
 *
 * Mettre en cache par requête (`?q=info`) ferait autant d'entrées que de
 * frappes, chacune reconstruisant l'index. On garde donc le CORPUS — construit
 * une fois par langue et par fenêtre — et on filtre à chaque question, ce qui
 * coûte un parcours de quelques centaines d'entrées.
 *
 * DIX MINUTES. Un catalogue de concours publics ne bouge pas à la minute ; une
 * fenêtre plus courte multiplierait les rafales de N+1 sans rien apporter, une
 * fenêtre plus longue retarderait la visibilité d'une filière qui ouvre.
 *
 * LE N+1 EST ICI, ET C'EST SA PLACE. Construire l'index demande un appel par
 * famille publiée, parce que `/catalogue` ne sert pas les spécialités. Payé au
 * rendu d'une page publique, ce coût serait payé par TOUS les visiteurs à
 * CHAQUE page ; payé ici, il l'est une fois par fenêtre, par le serveur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI N'EST PAS INDEXÉ, ET NE LE SERA PAS AVANT SON CONTRAT
 *
 * Ni annales, ni guides : leurs contrats n'existent pas. Une catégorie vide
 * dans des résultats de recherche n'est pas neutre — elle annonce un contenu
 * qui n'arrivera jamais.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES SOURCES SONT DÉCLARÉES DANS LA RÉPONSE
 *
 * `meta.sources` dit quels corpus ont RÉPONDU. Sans cela, un catalogue
 * injoignable rendrait « aucun résultat » — une affirmation fausse — là où la
 * vérité est « nous n'avons pas pu chercher partout ». C'est la même règle que
 * les compteurs de l'accueil, appliquée à une recherche.
 */

import type { AnnonceCollecteur } from '../utils/opportunites'

interface FamilleApi {
  uuid: string
  slug: string
  name: string
  availability: 'open' | 'waitlist' | 'closed'
  specialties?: Array<{ uuid: string, slug: string, name: string, availability: string }>
}

interface FiliereApi {
  uuid: string
  slug: string
  name: string
  tagline: string | null
  availability: 'open' | 'waitlist' | 'closed'
  families?: FamilleApi[]
}

/**
 * Une entrée d'index.
 *
 * `contexte` est déjà localisé — il vient de l'API, servie selon la langue de
 * requête. `etat` est un CODE : le client le traduit, parce qu'aucun code
 * d'énumération brut ne s'affiche à l'écran, et parce que ce serveur n'a pas de
 * table de traduction et n'a pas à en avoir une.
 */
export interface EntreeRecherche {
  type: 'filiere' | 'famille' | 'specialite' | 'opportunite'
  titre: string
  contexte: string
  chemin: string
  etat: string | null
}

interface Corpus {
  expire: number
  entrees: EntreeRecherche[]
  catalogueLu: boolean
}

const FENETRE_MS = 10 * 60 * 1000
const corpus = new Map<string, Corpus>()

/**
 * NORMALISATION — la même des deux côtés de la comparaison.
 *
 * Décomposition Unicode puis retrait des marques combinantes : cela couvre d'un
 * seul geste les accents latins (« é » → « e ») ET les signes diacritiques
 * arabes, qui sont eux aussi des marques combinantes. Un candidat qui tape
 * « education » doit trouver « éducation », et un candidat qui tape sans
 * voyelles doit trouver un titre vocalisé.
 *
 * Trois normalisations propres à l'arabe s'ajoutent, parce qu'aucune
 * décomposition ne les couvre :
 *   - le TATWEEL (ـ) est un allongement purement typographique ;
 *   - les formes de l'ALEF (أ إ آ ٱ) se saisissent indifféremment ;
 *   - le YA final et l'ALEF MAQSURA (ي / ى) se confondent à la saisie, et la
 *     TA MARBUTA (ة) se tape souvent « ه ».
 *
 * Sans elles, la recherche arabe échoue sur des mots parfaitement écrits — et
 * elle échoue en silence, en rendant « aucun résultat ».
 */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .trim()
}

async function construire(base: string, langue: string): Promise<Corpus> {
  const entrees: EntreeRecherche[] = []
  let catalogueLu = false

  /*
   * `Accept-Language` PORTE LA LANGUE. C'est le contrat des ressources du
   * catalogue : elles sont servies localisées, jamais avec des champs jumeaux
   * `titleFr`/`titleAr`. Un index construit sans cet en-tête serait français
   * pour tout le monde — le même défaut que la démonstration avant le lot 0.
   */
  const entetes = { 'Accept-Language': langue, 'Accept': 'application/json' }

  try {
    const index = await $fetch<{ data: FiliereApi[] }>(`${base}/api/v1/catalogue`, {
      headers: entetes,
    })

    catalogueLu = true

    for (const filiere of index.data) {
      entrees.push({
        type: 'filiere',
        titre: filiere.name,
        contexte: filiere.tagline ?? '',
        chemin: `/concours/${filiere.slug}`,
        etat: filiere.availability,
      })

      for (const famille of filiere.families ?? []) {
        entrees.push({
          type: 'famille',
          titre: famille.name,
          contexte: filiere.name,
          chemin: `/concours/famille/${famille.slug}`,
          etat: famille.availability,
        })
      }
    }

    /*
     * LES SPÉCIALITÉS demandent un appel par famille — `/catalogue` ne les sert
     * pas. `allSettled` : une fiche illisible retire SA famille de l'index, elle
     * ne vide pas l'index entier. Une famille absente de la recherche reste
     * trouvable par sa page ; un index absent ne laisse rien.
     */
    const familles = index.data.flatMap((f) =>
      (f.families ?? []).map((fam) => ({ famille: fam, filiere: f })),
    )

    const fiches = await Promise.allSettled(
      familles.map(({ famille }) =>
        $fetch<{ data: FamilleApi }>(`${base}/api/v1/catalogue/familles/${famille.slug}`, {
          headers: entetes,
        }),
      ),
    )

    fiches.forEach((fiche, i) => {
      if (fiche.status !== 'fulfilled') return

      const contexte = familles[i]!.famille.name
      const slugFamille = familles[i]!.famille.slug

      for (const specialite of fiche.value.data.specialties ?? []) {
        entrees.push({
          type: 'specialite',
          titre: specialite.name,
          contexte,
          chemin: `/concours/famille/${slugFamille}/${specialite.slug}`,
          etat: specialite.availability,
        })
      }
    })
  } catch {
    /* Catalogue injoignable. On ne fabrique rien : `catalogueLu` reste faux et
       la réponse le DIT, pour que « aucun résultat » ne soit pas affirmé à la
       place de « nous n'avons pas pu chercher partout ». */
  }

  const annonces: AnnonceCollecteur[] = await lireAnnonces()

  for (const annonce of annonces) {
    /* L'ÉTAT DU DÉPÔT EST RECALCULÉ depuis `deadline`, jamais lu dans le champ
       `jours` figé à la collecte : une annonce close ne doit pas remonter dans
       les résultats comme si l'on pouvait encore candidater. Le stade prime —
       une convocation n'est plus un moment de candidature. */
    const jours = joursRestants(annonce.deadline)
    const ouverte = annonce.stage === 'annonce' && (jours ?? -1) >= 0

    entrees.push({
      type: 'opportunite',
      titre: annonce.titre,
      contexte: annonce.org,
      chemin: `/opportunites/${annonce.slug}`,
      etat: ouverte ? 'ouverte' : 'close',
    })
  }

  return { expire: Date.now() + FENETRE_MS, entrees, catalogueLu }
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const requete = getQuery(event)

  const q = String(requete.q ?? '')
  const langue = requete.locale === 'ar' ? 'ar' : 'fr'
  const limite = Math.min(Math.max(Number(requete.limite) || 8, 1), 50)

  const terme = normaliser(q)

  /*
   * DEUX CARACTÈRES AU MINIMUM. En dessous, tout correspond : la réponse serait
   * un extrait arbitraire du catalogue présenté comme un résultat de recherche.
   * On rend une liste vide ET on dit pourquoi, plutôt que de laisser le client
   * deviner que sa question était trop courte.
   */
  if (terme.length < 2) {
    return {
      data: [],
      meta: { q, total: 0, trop_court: true, sources: { catalogue: false, opportunites: false } },
    }
  }

  const cle = langue
  let cache = corpus.get(cle)

  if (!cache || cache.expire < Date.now()) {
    cache = await construire(config.apiBaseUrl, langue)
    corpus.set(cle, cache)
  }

  /*
   * LE CLASSEMENT EST SIMPLE ET EXPLICABLE : un titre qui COMMENCE par le terme
   * passe devant un titre qui le contient, qui passe devant une correspondance
   * trouvée dans le seul contexte. Aucun score composite — un classement qu'on
   * ne sait pas expliquer est un classement qu'on ne sait pas corriger.
   */
  const trouves = cache.entrees
    .map((entree) => {
      const titre = normaliser(entree.titre)
      const contexte = normaliser(entree.contexte)

      if (titre.startsWith(terme)) return { entree, rang: 0 }
      if (titre.includes(terme)) return { entree, rang: 1 }
      if (contexte.includes(terme)) return { entree, rang: 2 }
      return null
    })
    .filter((x): x is { entree: EntreeRecherche, rang: number } => x !== null)
    .sort((a, b) => a.rang - b.rang)

  /*
   * `no-store` : la réponse dépend d'une question tapée par une personne, et
   * l'index derrière elle porte l'état d'ouverture des annonces, qui change de
   * jour en jour. Aucune fraîcheur à gagner, un décompte faux à risquer.
   */
  setResponseHeader(event, 'cache-control', 'no-store')

  return {
    data: trouves.slice(0, limite).map((x) => x.entree),
    meta: {
      q,
      total: trouves.length,
      trop_court: false,
      /* Quels corpus ont RÉELLEMENT répondu. La fixture est locale, donc
         toujours lue ; le catalogue peut manquer, et l'écran doit pouvoir le
         dire au lieu d'affirmer « aucun résultat ». */
      sources: { catalogue: cache.catalogueLu, opportunites: true },
    },
  }
})
