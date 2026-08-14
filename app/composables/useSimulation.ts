import { ApiRequestError } from './useApi'

/**
 * L'examen blanc : ouverture, et rapport post-épreuve.
 *
 * DEUX CHOSES QUE CE FICHIER NE FAIT PAS, ET C'EST DÉLIBÉRÉ.
 *
 * 1. IL NE DÉCOMPTE PAS LE TEMPS. Le chronomètre vit dans `useTentative`, qui
 *    l'ancre sur `seconds_remaining` du serveur et corrige la dérive. Un second
 *    décompte ici serait un second avis sur l'heure, et le jour où les deux
 *    diffèrent, aucun ne fait autorité.
 *
 * 2. IL NE CALCULE AUCUN SCORE. La note vient du serveur, pondérée par les
 *    poids officiels des domaines. La recalculer côté client — ne serait-ce que
 *    « pour éviter un aller-retour » — produirait un second barème, qui
 *    divergerait du premier au premier changement de règle.
 */

/** Une section du rapport : un sous-domaine pondéré de l'épreuve. */
export interface SectionDeRapport {
  node_uuid: string | null
  code: string | null
  name: string | null
  /** Le poids OFFICIEL du domaine. C'est lui qui autorise la note. */
  weight_percent: number | null
  asked: number
  answered: number
  correct: number
  rate: number | null
}

/**
 * La note blanche.
 *
 * `weighted_percent` est NUL quand aucune section pondérée n'a été servie.
 * L'écran doit alors ne rien afficher — pas « 0 % ». L'absence ne vaut pas
 * zéro : c'est la règle « aucun chiffre fabriqué » du dépôt.
 */
export interface NoteBlanche {
  weighted_percent: number | null
  /** Part du barème officiel réellement couverte par la série. */
  weight_covered: number
  sections_scored: number
}

/**
 * Ce que le descriptif officiel dit — ou ne dit pas.
 *
 * Ces champs sont NULS tant qu'aucune source officielle ne les établit, et
 * l'écran doit alors écrire « non précisé », jamais combler. `scoring_note` et
 * `admission_threshold_note` sont des CITATIONS du descriptif : on les rend
 * telles quelles, avec `dir="auto"`, sans les reformuler.
 */
export interface MentionsOfficielles {
  question_count: number | null
  scoring_note: string | null
  admission_threshold_note: string | null
  blueprint_version: string | null
}

export interface RapportSimulation {
  uuid: string
  kind: string
  /** `submitted` si le candidat a rendu, `expired` si le chronomètre a tranché. */
  status: string
  started_at: string
  submitted_at: string | null
  exam: {
    code: string
    name: string
    coefficient: number | null
    duration_minutes: number | null
  } | null
  score: NoteBlanche
  raw: { asked: number; answered: number; correct: number }
  sections: SectionDeRapport[]
  /** L'ordonnance : ce qu'il faut travailler ensuite. */
  plan: unknown[]
  official: MentionsOfficielles
  meta: {
    scoring_basis: string
    not_official_scale: string
    disclaimer: string
  }
}

export function useSimulation() {
  const api = useApi()

  /**
   * Le rapport post-épreuve.
   *
   * Le serveur CLÔT la tentative si l'échéance est passée : appeler cette
   * route sur une épreuve dont le temps s'est écoulé la termine et rend la
   * note. C'est voulu — le candidat qui revient une heure trop tard ne peut
   * plus soumettre, et lui répondre « pas encore terminée » serait absurde.
   */
  async function rapport(uuid: string): Promise<RapportSimulation> {
    const reponse = await api.get<{ data: RapportSimulation }>(
      `/me/simulations/${encodeURIComponent(uuid)}/report`,
    )
    return reponse.data
  }

  return { rapport, ApiRequestError }
}
