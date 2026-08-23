import { ApiRequestError } from './useApi'
import type { Tentative } from './useTentative'

/**
 * Rendez-vous Mémoire — F07.
 *
 * DEUX RÈGLES GOUVERNENT CE FICHIER
 *
 * « Rien d'échu » n'est PAS une erreur. La route rend une liste vide et la date
 * du prochain rendez-vous. « Rien aujourd'hui, prochain le 12 » est une
 * information ; un écran vide n'en est pas une, et laisse croire à une panne.
 *
 * Aucun plafond silencieux. Le serveur sert au plus `cap` rendez-vous et
 * annonce le reste dans `pending`. Cacher les 40 restants ferait croire au
 * candidat qu'il a fini sa journée.
 */

export interface RendezVous {
  uuid: string
  competency: { code: string | null; name: string | null }
  /** `null` quand la cause n'a jamais été révélée et que le quota est fermé. */
  cause: string | null
  cause_locked: boolean
  palier: number
  due_on: string | null
  /** Erreur commise avec certitude : le rendez-vous vient de là. */
  blind_error: boolean
  last_reviewed_at: string | null
}

/**
 * Le compte des échéances — servi ENTIER, ou pas du tout.
 *
 * Sans `memory.sessions`, la réponse ne porte ni `data` ni aucun de ces six
 * champs : `{"meta":{"exam_code":"…"}}`, et rien d'autre. Annoncer « 42 dus »
 * à qui ne peut pas ouvrir de séance est la définition d'une porte qui montre
 * sans ouvrir — le candidat apprend qu'il a du retard et n'a aucun geste à
 * faire.
 *
 * Tous les champs sont donc facultatifs dans le type, et le `?? 0` qui traînait
 * dans les écrans est parti avec : un `due_total` à zéro MENT sur la mesure
 * autant qu'une liste vide. Zéro est une information — « rien à réviser
 * aujourd'hui » — et l'absence n'en est pas une.
 */
export interface MetaEcheances {
  exam_code: string
  due_total?: number
  served?: number
  /** Échus non servis aujourd'hui. Dit, jamais masqué. */
  pending?: number
  cap?: number
  /** `null` quand plus aucun rendez-vous n'est programmé. */
  next_due_on?: string | null
  /** Échus qu'aucune question sœur ne peut servir. Un nombre, jamais le détail. */
  without_sibling?: number
}

export interface Echeances {
  data?: RendezVous[]
  meta: MetaEcheances
}

/** Ce que le serveur dit en ouvrant la séance. */
export interface MetaSeance {
  due_total: number
  served: number
  pending: number
  cap: number
  /** Une question peut couvrir plusieurs causes échues : `covered` ≥ `served`. */
  covered: number
  without_question: number
  /** Servis par l'énoncé DÉJÀ VU, faute de sœur en banque. Repli assumé, annoncé. */
  reserved_identical: number
}

export function useMemoire() {
  const api = useApi()

  function echeances(codeEpreuve: MaybeRefOrGetter<string>) {
    return useAsyncData(
      () => `echeances-${toValue(codeEpreuve)}`,
      () => api.get<Echeances>(`/me/memory/${encodeURIComponent(toValue(codeEpreuve))}/due`),
      { watch: [() => toValue(codeEpreuve)] },
    )
  }

  /**
   * Ouvre la séance du jour, ou rend celle déjà ouverte.
   *
   * Trois refus distincts, et ils n'appellent pas la même conduite :
   *   MEMORY_NOTHING_DUE          le candidat est à jour — rien à corriger
   *   MEMORY_NO_SIBLING_QUESTION  la banque ne couvre pas encore ces pièges
   *   IDEMPOTENCY_KEY_REUSED      la même clé sur une autre requête
   *
   * Les confondre en un seul message dirait au candidat de revenir demain là
   * où il n'y a rien à attendre de lui.
   */
  async function ouvrirSeance(
    codeEpreuve: string,
    total?: number,
  ): Promise<{ tentative: Tentative; meta: MetaSeance }> {
    const reponse = await api.post<{ data: Tentative; meta: MetaSeance }>(
      `/me/memory/${encodeURIComponent(codeEpreuve)}/session`,
      total === undefined ? {} : { total },
      { 'Idempotency-Key': cleDuJour(codeEpreuve) },
    )
    return { tentative: reponse.data, meta: reponse.meta }
  }

  /**
   * Clé d'idempotence de la séance, stable pour la JOURNÉE et l'épreuve.
   *
   * Le rendez-vous mémoire est quotidien : deux clics à dix minutes d'écart
   * visent la même séance. Une clé aléatoire par visite en ouvrirait deux, et
   * la seconde viderait le calendrier de la première.
   *
   * La date est celle du poste. Le serveur reste juge de ce qui est échu — la
   * clé ne sert qu'à ne pas redemander deux fois la même chose.
   */
  function cleDuJour(codeEpreuve: string): string {
    const jour = new Date().toISOString().slice(0, 10)
    return `revision.${codeEpreuve}.${jour}`
  }

  /** Le refus « rien d'échu » porte la prochaine date : ce n'est pas une panne. */
  function riendEchu(e: unknown): { prochaine: string | null } | null {
    if (!(e instanceof ApiRequestError) || e.error.code !== 'MEMORY_NOTHING_DUE') return null
    const d = e.error.details
    if (!d || Array.isArray(d)) return { prochaine: null }
    return { prochaine: (d as unknown as { next_due_on?: string }).next_due_on ?? null }
  }

  function sansQuestionSoeur(e: unknown): boolean {
    return e instanceof ApiRequestError && e.error.code === 'MEMORY_NO_SIBLING_QUESTION'
  }

  /**
   * Les rendez-vous ont-ils été RENDUS ?
   *
   * Même distinction que pour l'ordonnance, et pour la même raison. `data`
   * présent et vide veut dire « rien d'échu aujourd'hui », qui est une bonne
   * nouvelle à annoncer. `data` absent veut dire que la séance mémoire n'est
   * pas dans l'accès : l'écran n'affiche alors aucun compteur, parce qu'il n'y
   * en a pas et qu'un zéro serait un chiffre fabriqué.
   */
  function rendues(e: Echeances | null | undefined): boolean {
    return Array.isArray(e?.data)
  }

  return { echeances, ouvrirSeance, riendEchu, sansQuestionSoeur, rendues }
}
