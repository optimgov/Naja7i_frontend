/**
 * L'ESPACE FINE INSÉCABLE SUR LES NOMBRES — U+202F.
 *
 * Règle du dépôt, et elle n'est pas typographique : sans elle, « 4 200 » se lit
 * « 200 4 » en RTL, parce qu'une espace ordinaire autorise l'algorithme
 * bidirectionnel à réordonner les groupes. La fine insécable les soude.
 *
 * On groupe par milliers, comme le fait la source de la zone publique. On
 * n'emploie PAS `Intl.NumberFormat` : sous locale `ar` il rendrait des chiffres
 * arabo-indiens (٤٢٠٠) là où tout le produit affiche des chiffres latins —
 * D-F54 a tranché ce point, et un séparateur de milliers n'a pas de raison de
 * rouvrir le débat.
 */

const FINE = ' '

export function nombre(valeur: number | string | null | undefined): string {
  if (valeur === null || valeur === undefined) return ''

  return String(valeur).replace(/\B(?=(\d{3})+(?!\d))/g, FINE)
}
