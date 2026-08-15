
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
    return estNonRepresentatif(t.kind)
  }

  return { parcours, enCours, dernierePassee, estEntrainement }
}

/*
 * `Certitude` N'EST PAS RÉEXPORTÉ D'ICI — audit tournée 4, non bloquant.
 *
 * Ce fichier le tenait de `useTentative` et le réexportait, ce qui donnait DEUX
 * propriétaires au même nom pour l'auto-import de Nuxt : chaque compilation
 * avertissait, et le vainqueur dépendait de l'ordre de résolution. Un type dont
 * l'origine se décide à la compilation est un type qu'on ne sait pas suivre.
 *
 * Un seul propriétaire : `useTentative`, où il est défini. Les appelants le
 * prennent là, ou le laissent venir par l'auto-import — qui n'a plus de choix
 * à faire.
 */

/**
 * LES GENRES DE TENTATIVE, ÉNUMÉRÉS — audit tournée 3, BLOC-5.
 *
 * `estEntrainement` valait `kind !== 'diagnostic'`. À l'arrivée du simulateur,
 * il valait donc VRAI pour un examen blanc, et le tableau de bord annonçait
 * « série d'entraînement : ce résultat n'est pas représentatif du concours » —
 * l'inverse exact de ce que le rapport de la MÊME tentative affirme, à savoir
 * que la répartition officielle autorise le score pondéré.
 *
 * Le FRONT-6 avait énuméré le genre dans `correction.vue`, et là seulement. La
 * déduction par la négative avait survécu ici.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UNE CARTE ET NON UNE LISTE
 *
 * `satisfies Record<GenreDeTentative, boolean>` rend la carte EXHAUSTIVE :
 * ajouter un genre à l'union sans le classer ici fait ROUGIR LE TYPAGE. C'est
 * une garantie de compilation, pas un test qu'il faut penser à écrire — et
 * c'est ce qui empêche le prochain `kind` de rouvrir le trou.
 *
 * Un genre INCONNU du contrat rend `false` : ne rien affirmer vaut mieux
 * qu'affirmer une qualification fausse, qui est précisément le défaut corrigé.
 */
export type GenreDeTentative = 'diagnostic' | 'training' | 'review' | 'mirror' | 'simulation'

const NON_REPRESENTATIF = {
  /* Composé aux poids officiels : représentatif par construction. */
  diagnostic: false,
  /* Composé aux poids officiels lui aussi — c'est ce qui autorise sa note. */
  simulation: false,
  /* Ciblés sur une faiblesse, une échéance ou un piège : jamais représentatifs. */
  training: true,
  review: true,
  mirror: true,
} as const satisfies Record<GenreDeTentative, boolean>

export function estNonRepresentatif(kind: string): boolean {
  return NON_REPRESENTATIF[kind as GenreDeTentative] ?? false
}
