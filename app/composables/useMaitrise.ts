/**
 * Maîtrise par domaine.
 *
 * LA RÈGLE QUI GOUVERNE CE FICHIER
 *
 * Un score ne s'affiche jamais seul. `score` peut valoir `null` — et `null`
 * n'est pas zéro : il veut dire « pas encore assez de réponses pour conclure ».
 * Les afficher pareil serait un mensonge sur la personne, pas un détail de
 * présentation : un candidat qui lit « 0 % » sur un domaine qu'il n'a jamais
 * travaillé croit avoir échoué à ce qu'il n'a pas passé.
 *
 * Le type rend donc `score` explicitement nullable, et les aides ci-dessous
 * séparent les deux cas plutôt que de les fondre dans un `?? 0`.
 */

export interface DomaineDeMaitrise {
  node_uuid: string
  node_code: string
  node_name: string
  depth: number
  weight_percent: number | null
  /** `null` = évidence insuffisante. JAMAIS à confondre avec 0. */
  score: number | null
  /** Qualificatif servi par le serveur — « insufficient », etc. Pas un nombre. */
  evidence: string
  answered_count: number
  answers_missing: number
  skipped_count: number
  lucky_guesses: number
  confident_errors: number
  last_answered_at: string | null
}

export interface ResumeMaitrise {
  [cle: string]: unknown
}

export interface Maitrise {
  data: DomaineDeMaitrise[]
  meta: ResumeMaitrise
}

export function useMaitrise() {
  const api = useApi()

  /**
   * `useAsyncData` place `undefined` dans `error`, pas `null` : tester
   * `error.value !== null` rendrait la condition toujours vraie et afficherait
   * le repli en permanence. On teste la véracité. (CLAUDE.md, contrat d'API.)
   */
  function maitrise(codeEpreuve: MaybeRefOrGetter<string>) {
    return useAsyncData(
      () => `maitrise-${toValue(codeEpreuve)}`,
      () => api.get<Maitrise>(`/me/mastery/${encodeURIComponent(toValue(codeEpreuve))}`),
      { watch: [() => toValue(codeEpreuve)] },
    )
  }

  /** Un domaine sur lequel on ne peut rien conclure — pas un domaine à zéro. */
  function sansConclusion(d: DomaineDeMaitrise): boolean {
    return d.score === null
  }

  /**
   * Domaine jamais évalué : aucun angle mort n'est présenté comme une lacune
   * démontrée. Le motif fait autorité côté ordonnance ; ici on le déduit de
   * l'absence totale de réponse, seule information dont la maîtrise dispose.
   */
  function jamaisEvalue(d: DomaineDeMaitrise): boolean {
    return d.answered_count === 0
  }

  return { maitrise, sansConclusion, jamaisEvalue }
}
