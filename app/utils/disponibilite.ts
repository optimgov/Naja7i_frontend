/**
 * LES TROIS ÉTATS DE DISPONIBILITÉ DU CATALOGUE, ET LEUR LIBELLÉ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE CORRESPONDANCE VIT DANS UN SEUL FICHIER
 *
 * Le contrat public sert trois valeurs — `open`, `waitlist`, `closed` — et
 * quatre surfaces les affichent : la carte de concours, le méga-menu, la
 * palette de recherche et la page de résultats. Chacune avait sa propre
 * traduction du code en mot, et elles avaient déjà divergé : la carte repliait
 * `closed` sur « En préparation », c'est-à-dire qu'elle annonçait un concours
 * FERMÉ comme un concours à venir. Un candidat qui lit « En préparation »
 * attend une ouverture ; il ne saurait pas qu'il vient d'en manquer une.
 *
 * Le défaut était invisible en recette parce que la banque locale ne porte
 * aujourd'hui que `open` et `waitlist` : aucun audit visuel ne pouvait le faire
 * rougir. C'est exactement la raison pour laquelle la correspondance est
 * TYPÉE et EXHAUSTIVE — `Record<Disponibilite, string>` fait échouer
 * `npm run typecheck` le jour où le contrat gagne une quatrième valeur, au lieu
 * d'attendre qu'un candidat la rencontre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUCUN REPLI N'AFFICHE LE CODE BRUT
 *
 * `cleDisponibilite` rend `null` sur une valeur inconnue, jamais la chaîne
 * reçue. Écrire « waitlist » à l'écran ne renseigne personne, ne se traduit pas,
 * et se lit comme une fuite de base de données — c'est la règle du dépôt :
 * aucun code d'énumération brut à l'écran. L'appelant fait alors disparaître la
 * mention, ce qui est honnête : on ne sait pas nommer cet état.
 *
 * Ce module ne dépend ni de Vue ni de Nuxt : il est importable tel quel par
 * `scripts/verifier-disponibilite.mjs`, qui lui injecte les trois valeurs.
 */

/** Les valeurs servies par le contrat public. */
export type Disponibilite = 'open' | 'waitlist' | 'closed'

/**
 * La clé i18n de chaque état. Exhaustive par construction : ajouter une valeur
 * au type sans l'ajouter ici ne compile pas.
 */
export const CLES_DISPONIBILITE: Record<Disponibilite, string> = {
  open: 'catalogue.dispo_open',
  waitlist: 'catalogue.dispo_waitlist',
  closed: 'catalogue.dispo_closed',
}

/**
 * `hasOwnProperty` et non `in` : `'toString' in CLES_DISPONIBILITE` vaut vrai,
 * et laisserait passer des noms de la chaîne de prototypes.
 */
export function estDisponibilite(code: unknown): code is Disponibilite {
  return typeof code === 'string'
    && Object.prototype.hasOwnProperty.call(CLES_DISPONIBILITE, code)
}

/** La clé à traduire, ou `null` — jamais le code reçu. */
export function cleDisponibilite(code: unknown): string | null {
  return estDisponibilite(code) ? CLES_DISPONIBILITE[code] : null
}
