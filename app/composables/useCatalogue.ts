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
  exams?: Array<{ code: string; name: string; coefficient: number | null }>
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

  return { filieres, filiere, famille, specialite, calendrier }
}

/**
 * Compteurs de l'accueil, calculés depuis le catalogue réel.
 *
 * La maquette v1 annonçait « 4 200 questions » sur une banque vide. Une phrase
 * honnête vaut mieux qu'un chiffre gonflé au moment où l'on a trois épreuves
 * et pas trente (NAJA7I-ZP-001 §4).
 */
export function useChiffresReels() {
  const { filieres } = useCatalogue()
  const { data } = filieres()

  return computed(() => {
    const liste = data.value ?? []
    const familles = liste.flatMap((f) => f.families ?? [])

    return {
      filieres: liste.length,
      familles: familles.length,
      ouvertes: familles.filter((f) => f.availability === 'open').length,
    }
  })
}
