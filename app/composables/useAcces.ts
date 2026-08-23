import type { Enveloppe, EtatCommercial, LigneDeDroit } from './useAbonnement'

/**
 * L'ACCÈS DU CANDIDAT — ce que le serveur lui ouvre, lu UNE FOIS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE, ET POURQUOI CE N'EST PAS UNE SONDE
 *
 * La règle du lot est que le mur est un champ : quand le serveur ne rend pas
 * `data`, l'écran ne dessine rien à sa place. Pour l'ordonnance et les
 * rendez-vous mémoire, cela suffit — la réponse déjà demandée porte le champ,
 * ou ne le porte pas, et l'écran lit.
 *
 * Deux capacités échappent à ce raisonnement : `series.targeted` et
 * `simulator.full` ne ferment aucune LECTURE, elles ferment une ACTION. Aucune
 * réponse ne porte donc de champ à leur sujet, et un tableau de bord qui
 * proposerait quand même le geste construirait exactement la porte que la
 * mission interdit — celle qui montre sans ouvrir, et dont le candidat
 * n'apprend la fermeture qu'après le clic, en 403.
 *
 * ON N'AJOUTE D'APPEL NULLE PART POUR AUTANT, et c'est la condition de
 * l'interdit. Chacun des cinq écrans qui appelle ceci a, pour le faire, une
 * raison qui n'est pas la permission :
 *
 *   · le tableau de bord et l'écran d'abonnement ont besoin de l'ÉTAT
 *     commercial d'ADR-0033 — et surtout de la SORTIE d'un compte épuisé, qui
 *     n'existe que sur cette réponse ;
 *   · le seuil du diagnostic, le configurateur d'entraînement et le seuil de
 *     l'examen blanc ont besoin du RELIQUAT, pour annoncer le coût avant le
 *     geste (S-10). C'est une exigence de la mission, pas une sonde.
 *
 * Les capacités voyagent dans la même réponse. S'en servir n'est donc pas une
 * question posée au serveur pour « savoir si c'est permis » : c'est la lecture
 * qu'on tenait déjà. Les écrans qui n'ont AUCUNE de ces deux raisons —
 * ordonnance, révisions, maîtrise — n'appellent pas ceci du tout : ils lisent
 * la présence du champ dans leur propre réponse, et c'est tout.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE SEULE REQUÊTE, MÊME APPELÉE DE PARTOUT
 *
 * `useAsyncData` est indexé par clé. Tous ces écrans demandent la même —
 * `abonnement.etat` — et n'obtiennent qu'un aller-retour, transmis au
 * navigateur par la charge utile du rendu serveur. Un `useState` maison ferait
 * la même chose en moins bien, et sans le rafraîchissement que l'écran
 * d'abonnement utilise après un paiement.
 */

/**
 * LES IDENTIFIANTS D'AUTORISATION SONT DU CODE — ADR-0032.
 *
 * Ce ne sont ni des libellés ni des seuils : ce sont les clés sur lesquelles
 * l'écran compare, et une valeur fausse ici ne produirait pas un mauvais
 * produit mais un état interdit. Leur PRÉSENTATION, elle, ne vient jamais
 * d'ici — elle vient du référentiel bilingue, servi par `capability_details`.
 *
 * On ne nomme que celles dont un écran a besoin pour décider s'il rend un
 * geste. Ce n'est pas la liste des capacités du produit, et ce fichier n'a pas
 * à la connaître.
 */
export const CAPACITE = {
  /** Ouvrir une série ciblée. Ferme une ACTION, aucune lecture. */
  SERIE_CIBLEE: 'series.targeted',
  /** Ouvrir un examen blanc. Ferme une ACTION, aucune lecture. */
  EXAMEN_BLANC: 'simulator.full',
  /** L'enveloppe de questions : c'est elle qui porte le reliquat annoncé. */
  REPONDRE: 'questions.answer',
} as const

export type CodeDeCapacite = (typeof CAPACITE)[keyof typeof CAPACITE]

export function useAcces() {
  const { etat } = useAbonnement()

  /**
   * Charge l'accès. À appeler dans le `setup` d'un écran de la zone candidat.
   *
   * Rend aussi `rafraichir`, parce qu'un paiement change l'accès sans changer
   * de route : l'écran d'abonnement relit, et le tableau de bord voit la
   * différence au retour.
   */
  async function acces() {
    const { data, error, refresh } = await etat()

    /*
     * `useAsyncData` place `undefined` dans `error`, pas `null` : on teste la
     * VÉRACITÉ. Tester `error.value !== null` rendrait la condition toujours
     * vraie, et tout serait fermé en permanence. Piège documenté du dépôt.
     */
    const lu = computed(() => !error.value && data.value != null)

    const capacites = computed<string[]>(() => (lu.value ? (data.value!.capabilities ?? []) : []))

    /**
     * Cette capacité est-elle ouverte ?
     *
     * FAUX QUAND L'ÉTAT EST ILLISIBLE, et c'est délibéré : proposer un geste
     * qu'on n'a pas pu vérifier le ferait refuser en 403 après le clic. Les
     * écrans qui gardent une action lisent `lu` à côté, et disent la panne
     * plutôt que de la déguiser en mur.
     */
    const ouvre = (code: string): boolean => capacites.value.includes(code)

    const etatCommercial = computed<EtatCommercial | null>(() =>
      lu.value ? data.value!.etat : null,
    )

    /** Le libellé de l'état, servi traduit. Jamais reconstruit ici. */
    const etatLabel = computed<string | null>(() => (lu.value ? data.value!.etat_label : null))

    /**
     * La phrase de sortie d'un compte épuisé, servie par le serveur.
     *
     * `null` partout ailleurs. Aucun repli en dur : si le serveur cesse de la
     * servir, elle disparaît de l'écran — les issues, elles, restent, parce
     * qu'elles sont des liens et non une phrase.
     */
    const sortie = computed<string | null>(() => (lu.value ? data.value!.sortie : null))

    const droits = computed<LigneDeDroit[]>(() => (lu.value ? (data.value!.droits ?? []) : []))
    const quotas = computed<Enveloppe[]>(() => (lu.value ? (data.value!.quotas ?? []) : []))

    /**
     * L'enveloppe qui gouverne une capacité, s'il y en a une.
     *
     * `null` a DEUX sens que l'écran ne doit pas confondre, et c'est pourquoi
     * cette fonction ne rend jamais zéro : ou bien la capacité est fermée, ou
     * bien elle est ouverte sans quota — c'est-à-dire illimitée. Le serveur
     * fait la même distinction avec deux exceptions distinctes (lot 3B) ; ici
     * l'appelant la refait avec `ouvre()`.
     */
    const enveloppeDe = (code: string): Enveloppe | null =>
      quotas.value.find(q => q.capability === code) ?? null

    return {
      lu,
      capacites,
      ouvre,
      etat: etatCommercial,
      etatLabel,
      sortie,
      droits,
      quotas,
      enveloppeDe,
      rafraichir: refresh,
      brut: data,
    }
  }

  return { acces }
}
