/**
 * Accès au catalogue public.
 *
 * Toutes les données viennent de l'API — aucune valeur en dur, c'est le
 * premier critère de recette de NAJA7I-ZP-001. Les compteurs de l'accueil
 * eux-mêmes sont calculés à partir de ce que le catalogue contient réellement.
 */

export interface Filiere {
  uuid: string
  slug: string
  name: string
  tagline: string | null
  availability: 'open' | 'waitlist' | 'closed'
  families?: Famille[]
}

export interface Famille {
  uuid: string
  slug: string
  name: string
  authority: string | null
  description: string | null
  availability: 'open' | 'waitlist' | 'closed'
  filiere?: { slug: string; name: string }
  specialties?: Specialite[]
  sessions?: Session[]
  /* Trois épreuves distinctes par famille CRMEF, de coefficients 8, 12 et 20 :
     c'est la correction structurelle du PAS-4.1, et elle manquait au type. */
  exams?: Array<{
    code: string
    name: string
    coefficient: number | null
    diagnostic_ready: boolean
  }>
  taxonomy?: { levels: Array<{ depth: number; name: string }> }
}

export interface Specialite {
  uuid: string
  slug: string
  name: string
  cycle: string | null
  description: string | null
  availability: 'open' | 'waitlist' | 'closed'
  family?: { slug: string; name: string }
}

export interface Session {
  uuid: string
  label: string
  year: number
  registration_closes_on: string | null
  written_exam_on: string | null
  /** Jamais optionnel : une date non confirmée doit être signalée (ADR-0014). */
  dates_confirmed: boolean
  source_url: string | null
  source_note: string | null
  family?: { slug: string; name: string }
}

export function useCatalogue() {
  const api = useApi()

  const filieres = () =>
    useAsyncData('catalogue', () => api.get<{ data: Filiere[] }>('/catalogue'), {
      transform: (r) => r.data,
    })

  const filiere = (slug: string) =>
    useAsyncData(`filiere:${slug}`, () => api.get<{ data: Filiere }>(`/catalogue/filieres/${slug}`), {
      transform: (r) => r.data,
    })

  const famille = (slug: string) =>
    useAsyncData(`famille:${slug}`, () => api.get<{ data: Famille }>(`/catalogue/familles/${slug}`), {
      transform: (r) => r.data,
    })

  const specialite = (famille: string, specialite: string) =>
    useAsyncData(
      `specialite:${famille}:${specialite}`,
      () => api.get<{ data: Specialite }>(`/catalogue/familles/${famille}/specialites/${specialite}`),
      { transform: (r) => r.data },
    )

  const calendrier = (filtres: Record<string, unknown> = {}) =>
    useAsyncData('calendrier', () => api.get<{ data: Session[] }>('/catalogue/calendrier', filtres), {
      transform: (r) => r.data,
    })

  /**
   * La matrice d'une ÉPREUVE : ses domaines, leurs poids, sa durée officielle.
   *
   * Route PUBLIQUE du PAS-4.1, déjà servie par le catalogue — on ne crée pas
   * une seconde lecture du référentiel pour le simulateur. C'est la même
   * matrice qui compose la série côté serveur, et l'écran de seuil doit
   * annoncer exactement ce qui sera composé.
   *
   * On garde la réponse ENTIÈRE (`data` + `meta`) : `meta.exam` porte la durée
   * et le coefficient, `data` porte l'arbre des domaines. Les deux sont
   * nécessaires à E9, et les séparer obligerait à deux appels.
   */
  const referentielEpreuve = (code: string) =>
    useAsyncData(
      `epreuve:competences:${code}`,
      () => api.get<ReferentielEpreuve>(`/catalogue/epreuves/${encodeURIComponent(code)}/competences`),
    )

  /**
   * LES ÉPREUVES SUR LESQUELLES ON PEUT COMMENCER — la porte du D-01.
   *
   * Un compte neuf n'a aucune tentative, donc aucune épreuve « suivie », et le
   * tableau de bord n'avait rien à proposer. Il lui faut la liste de ce qui est
   * ouvert, et elle n'existait nulle part : l'index du catalogue ne sert pas
   * `exams`, seule la fiche de famille le fait.
   *
   * ON NE DEMANDE QUE LES FAMILLES OUVERTES. Une famille en liste d'attente ne
   * propose aucun diagnostic (critère NAJA7I-ZP-001 §9) : demander sa matrice
   * ferait un appel pour une porte qu'on n'ouvrira pas.
   *
   * Une famille dont la fiche est illisible DISPARAÎT de la liste — elle ne
   * vaut pas zéro épreuve. C'est la même règle que les compteurs de l'accueil :
   * l'absence ne dit rien, elle n'affirme pas.
   */
  const epreuvesOuvertes = () =>
    useAsyncData('catalogue:epreuves-ouvertes', async () => {
      const index = await api.get<{ data: Filiere[] }>('/catalogue')

      const ouvertes = index.data
        .flatMap((f) => f.families ?? [])
        .filter((f) => f.availability === 'open')

      const fiches = await Promise.all(
        ouvertes.map((f) =>
          api
            .get<{ data: Famille }>(`/catalogue/familles/${f.slug}`)
            .then((r) => r.data)
            .catch(() => null),
        ),
      )

      return fiches
        .filter((f): f is Famille => f !== null)
        .flatMap((f) =>
          (f.exams ?? [])
            .filter((e) => e.diagnostic_ready)
            .map((e) => ({ ...e, famille: { slug: f.slug, name: f.name } })),
        )
    })

  return { filieres, filiere, famille, specialite, calendrier, referentielEpreuve, epreuvesOuvertes }
}

/** Une épreuve ouverte, avec la famille qui la porte — pour l'annoncer. */
export interface EpreuveOuverte {
  code: string
  name: string
  coefficient: number | null
  diagnostic_ready: boolean
  famille: { slug: string; name: string }
}

/** Un domaine du référentiel. `weight_percent` est nul quand le descriptif ne le donne pas. */
export interface NoeudDeCompetence {
  uuid: string
  code: string
  name: string
  depth: number
  level_name: string | null
  weight_percent: number | null
  source: string | null
  children?: NoeudDeCompetence[]
}

export interface ReferentielEpreuve {
  data: NoeudDeCompetence[]
  meta: {
    exam: {
      code: string
      name: string
      coefficient: number | null
      /** Nulle tant qu'une source officielle ne l'établit pas. */
      duration_minutes: number | null
      provenance: string | null
    }
    levels: { depth: number; name: string }[]
    node_count: number
  }
}

/** Une métrique publique. Elle n'existe dans cette liste que si elle est positive. */
export interface MesurePublique {
  cle: 'filieres' | 'familles' | 'ouvertes'
  valeur: number
}

export interface ChiffresPublics {
  /**
   * Le catalogue a-t-il pu être LU ? Faux ne veut pas dire « vide ».
   *
   * La distinction est conservée DANS LE CODE même si l'écran ne rend rien dans
   * les deux cas : c'est elle qui empêchera la prochaine surface de traiter une
   * panne d'API comme un catalogue sans filière.
   */
  lisible: boolean
  /** Les métriques STRICTEMENT POSITIVES, dans l'ordre d'affichage. */
  mesures: MesurePublique[]
}

/**
 * Compteurs de l'accueil, calculés depuis le catalogue réel.
 *
 * La maquette v1 annonçait « 4 200 questions » sur une banque vide. Une phrase
 * honnête vaut mieux qu'un chiffre gonflé au moment où l'on a trois épreuves
 * et pas trente (NAJA7I-ZP-001 §4).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX RÈGLES DISTINCTES, ET ELLES NE SE DÉDUISENT PAS L'UNE DE L'AUTRE
 *
 * 1. CATALOGUE ILLISIBLE → RIEN. Rendre 0 lorsque l'API est injoignable, c'est
 *    afficher une valeur de secours : « 0 filière » est une affirmation FAUSSE
 *    sur le catalogue, là où l'absence du bloc ne dit rien.
 *
 * 2. MÉTRIQUE RÉELLEMENT NULLE → RIEN NON PLUS, sur une surface publique.
 *    Arbitrage du propriétaire, 20 août. « 0 préparation ouverte » est un fait
 *    exact — mais sur une page qui existe pour convaincre, un fait exact
 *    présenté comme preuve commerciale se retourne contre le produit. Le
 *    diagnostic honnête de l'état vide se fait sur `/se-preparer`, en toutes
 *    lettres et à sa place ; un chiffre nu dans un bandeau de chiffres ne dit
 *    pas « la préparation ouvre bientôt », il dit « il n'y a rien ici ».
 *
 * Le bloc entier disparaît quand aucune métrique ne subsiste : trois cases dont
 * deux sont vides se lisent comme un rendu cassé.
 */
export function useChiffresReels() {
  const { filieres } = useCatalogue()
  const { data, error } = filieres()

  return computed<ChiffresPublics>(() => {
    if (error.value || data.value == null) {
      return { lisible: false, mesures: [] }
    }

    const liste = data.value
    const familles = liste.flatMap((f) => f.families ?? [])

    const brutes: MesurePublique[] = [
      { cle: 'filieres', valeur: liste.length },
      { cle: 'familles', valeur: familles.length },
      { cle: 'ouvertes', valeur: familles.filter((f) => f.availability === 'open').length },
    ]

    return { lisible: true, mesures: brutes.filter((m) => m.valeur > 0) }
  })
}
