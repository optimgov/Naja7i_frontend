/**
 * Ordonnance Najah — ce qu'il y a à travailler, et pourquoi.
 *
 * LA RÈGLE QUI GOUVERNE CE FICHIER
 *
 * Aucune prédiction. `meta.disclaimer` vient du serveur et s'affiche : c'est un
 * marqueur contractuel, du même ordre que la mention d'exemple du bloc de
 * démonstration. Il n'est jamais réécrit ici, et il n'existe aucun repli en
 * dur — si le serveur cesse de le servir, il disparaît de l'écran plutôt que
 * d'être imité. Une interface qui réécrit elle-même la clause qui l'engage la
 * vide de son sens.
 *
 * `reason` est un motif LISIBLE, pas un score. Il se traduit — aucun code
 * d'énumération brut à l'écran — et il porte l'explication attendue par la
 * règle « aucun résultat affiché sans explication ».
 */

/** Les sept motifs servis par le planificateur. */
export type MotifOrdonnance =
  | 'erreurs_avec_certitude'
  | 'reussites_au_hasard'
  | 'questions_sautees'
  | 'jamais_evalue'
  | 'evidence_faible'
  | 'maitrise_faible'
  | 'consolidation'

/**
 * Relevé sur la réponse réelle : le planificateur sert plus que les six champs
 * annoncés — il joint l'état de maîtrise du domaine à sa ligne de plan. C'est
 * ce qui permet d'afficher le motif AVEC ce qui le fonde, sans second appel.
 */
export interface LigneOrdonnance {
  node_uuid: string
  node_code: string
  node_name: string
  weight_percent: number | null
  /** `null` = pas assez d'évidence. Jamais rendu comme 0. */
  score: number | null
  evidence: string
  answered_count: number
  answers_missing: number
  skipped_count: number
  confident_errors: number
  lucky_guesses: number
  urgency: number
  reason: MotifOrdonnance | string
  remediation: { uuid: string; title: string; estimated_minutes: number | null } | null
}

export interface Ordonnance {
  data: LigneOrdonnance[]
  meta: { disclaimer?: string } & Record<string, unknown>
}

/** Bornes du contrat : `limit` va de 1 à 20, défaut 5. */
const LIMITE_MIN = 1
const LIMITE_MAX = 20

export function useOrdonnance() {
  const api = useApi()

  function ordonnance(codeEpreuve: MaybeRefOrGetter<string>, limite?: MaybeRefOrGetter<number>) {
    return useAsyncData(
      () => `ordonnance-${toValue(codeEpreuve)}-${toValue(limite) ?? 'defaut'}`,
      () => {
        const brute = toValue(limite)
        // Borné côté client aussi : envoyer 0 ou 50 ferait répondre 422 au
        // serveur, et le candidat verrait une erreur pour un réglage
        // d'interface. Le serveur reste juge, on ne lui envoie simplement pas
        // ce qu'on sait invalide.
        const limitee =
          brute === undefined ? undefined : Math.min(LIMITE_MAX, Math.max(LIMITE_MIN, Math.trunc(brute)))

        return api.get<Ordonnance>(
          `/me/plan/${encodeURIComponent(toValue(codeEpreuve))}`,
          limitee === undefined ? undefined : { limit: limitee },
        )
      },
      { watch: [() => toValue(codeEpreuve), () => toValue(limite)] },
    )
  }

  /**
   * Un domaine jamais évalué est un angle mort à découvrir, pas une lacune
   * démontrée. La distinction est portée par le motif, donc par le serveur :
   * l'interface ne la devine pas, elle la lit.
   */
  function estAngleMort(ligne: LigneOrdonnance): boolean {
    return ligne.reason === 'jamais_evalue'
  }

  return { ordonnance, estAngleMort }
}
