import type { Certitude } from './useTentative'

/**
 * Correction d'une tentative soumise — l'écran qui justifie le lot.
 *
 * Deux fiches y vivent ensemble, et il ne faut pas les confondre :
 *
 *  - `rationale` : POURQUOI une option est fausse. Toujours servie, jamais
 *    conditionnée. C'est le contenu éditorial de la question.
 *  - `cause` : pourquoi le candidat a PROBABLEMENT choisi celle-là. Soumise au
 *    quota, et hypothèse par nature (fiches F03 et F04).
 *
 * Quand le quota est épuisé, le serveur retire les causes et pose
 * `cause_locked`. Il ne retire jamais les justifications : le mur payant est un
 * champ, pas une route.
 */

export interface OptionCorrigee {
  uuid: string
  position: number
  content: string
  is_correct: boolean
  rationale: string | null
  /** `null` quand l'auteur n'a pas étiqueté, OU quand le quota est épuisé. */
  cause: string | null
}

export interface LigneCorrection {
  item_uuid: string
  position: number
  question: { uuid: string; stem: string; explanation: string | null }
  answer: {
    selected_option_uuid: string | null
    is_correct: boolean
    confidence: Certitude | null
  }
  options: OptionCorrigee[]
  /** Vrai quand le quota a fermé les causes de CETTE ligne. */
  cause_locked: boolean
  competency: { code: string | null; name: string | null }
  remediation: { uuid: string; title: string; estimated_minutes: number | null } | null
}

export interface QuotaDeCauses {
  unlimited: boolean
  revealed: number
  quota: number
}

export interface Correction {
  data: LigneCorrection[]
  meta: {
    attempt_uuid: string
    correct_count: number
    item_count: number
    cause_quota: QuotaDeCauses
  }
}

export function useCorrection() {
  const api = useApi()

  function correction(uuid: MaybeRefOrGetter<string>) {
    return useAsyncData(
      () => `correction-${toValue(uuid)}`,
      () => api.get<Correction>(`/me/attempts/${toValue(uuid)}/correction`),
      { watch: [() => toValue(uuid)] },
    )
  }

  /**
   * Une ligne dont la cause est fermée par le quota — à distinguer d'une ligne
   * dont l'auteur n'a simplement pas étiqueté les distracteurs. Dans le premier
   * cas on propose l'abonnement ; dans le second on ne dit rien, parce qu'il n'y
   * a rien à dire et que la fonction ne devine jamais (F03).
   */
  function causeFermee(ligne: LigneCorrection): boolean {
    return ligne.cause_locked
  }

  return { correction, causeFermee }
}
