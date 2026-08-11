import type { Certitude } from './useTentative'

/**
 * Index des tentatives du candidat — `GET me/attempts`.
 *
 * Il remplace la trace locale de `useSuivi`, qui n'existait que parce que le
 * contrat n'exposait aucun moyen de savoir ce que le candidat avait déjà fait.
 * Le serveur le sait désormais : c'est lui qui répond.
 *
 * La différence n'est pas théorique. Une trace de navigateur ne suit pas le
 * candidat d'un appareil à l'autre : ouvrir le tableau de bord sur un téléphone
 * après avoir passé un diagnostic sur un poste montrait un espace vide. L'index
 * répond la même chose partout.
 */

export interface TentativeResumee {
  uuid: string
  kind: string
  status: string
  locale: string
  item_count: number
  answered_count: number
  /** Absent tant que la série n'est pas soumise. */
  correct_count?: number
  started_at: string
  submitted_at: string | null
  last_activity_at: string | null
  seconds_remaining: number | null
  exam: { code: string; name: string; coefficient: number | null }
}

export interface Parcours {
  data: TentativeResumee[]
  meta: { total: number; served: number; pending: number; cap: number }
}

export function useParcours() {
  const api = useApi()

  function parcours() {
    return useAsyncData('parcours', () => api.get<Parcours>('/me/attempts'))
  }

  /** La série encore ouverte, s'il y en a une. */
  function enCours(liste: TentativeResumee[]): TentativeResumee | null {
    return liste.find((t) => t.status === 'in_progress') ?? null
  }

  /**
   * La dernière série soumise — celle dont la correction et la maîtrise ont un
   * sens. On trie sur `last_activity_at`, pas sur `submitted_at` : une reprise
   * tardive fait d'une vieille série la plus récente activité.
   */
  function dernierePassee(liste: TentativeResumee[]): TentativeResumee | null {
    const soumises = liste.filter((t) => t.status !== 'in_progress')
    if (!soumises.length) return null

    return [...soumises].sort((a, b) =>
      String(b.last_activity_at ?? b.submitted_at ?? '').localeCompare(
        String(a.last_activity_at ?? a.submitted_at ?? ''),
      ),
    )[0]!
  }

  /**
   * Règle 9bis : un résultat d'ENTRAÎNEMENT n'est pas représentatif du concours,
   * par construction — la série est composée à la demande, pas pondérée par les
   * poids officiels. Il ne se présente jamais comme une note d'épreuve.
   */
  function estEntrainement(t: { kind: string }): boolean {
    return t.kind !== 'diagnostic'
  }

  return { parcours, enCours, dernierePassee, estEntrainement }
}

export type { Certitude }
