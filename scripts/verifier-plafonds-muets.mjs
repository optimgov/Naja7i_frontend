#!/usr/bin/env node
/**
 * verifier-plafonds-muets.mjs — AUCUNE LISTE NE SE TRONQUE EN SILENCE.
 *
 *   npm run plafonds
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 *
 * Le panneau « Concours » rendait `slice(0, 3)` sur les familles d'une filière.
 * Trois sur quatre, sans un mot, pendant que `/concours` en annonçait quatre
 * deux clics plus loin. Mesuré sur la préproduction : un candidat qui prépare
 * COPS ouvrait le menu, ne trouvait pas sa famille, et pouvait en conclure que
 * le produit ne la couvre pas.
 *
 * Le dépôt tient déjà ce principe : FRONT-4 éprouve « aucun plafond
 * silencieux » sur la liste des révisions, et la recette le rend rouge s'il
 * revient. Ce contrôle l'étend aux écrans du catalogue, que nulle recette
 * authentifiée ne traverse.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'IL INTERDIT, ET CE QU'IL PERMET
 *
 * Il interdit un `slice(0, n)` ou un `.slice(n)` posé sur une liste RENDUE, sans
 * qu'un mot voisin dise qu'il y en a plus.
 *
 * Il ne fait pas la police du découpage en général : `slice` sur une chaîne,
 * sur un tableau qu'on ne rend pas, ou accompagné d'une mention de reste, reste
 * permis. Un plafond ASSUMÉ n'est pas un plafond muet — c'est un choix, et le
 * dire suffit à le rendre honnête.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** Tous les gabarits et composants d'écran. */
function fichiers(racine, trouves = []) {
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree)
    if (statSync(chemin).isDirectory()) fichiers(chemin, trouves)
    else if (chemin.endsWith('.vue')) trouves.push(chemin)
  }
  return trouves
}

/* Les mots par lesquels un écran ASSUME son plafond. Une liste tronquée qui
 * porte l'un d'eux n'est plus muette. */
const AVEUX = new RegExp([
  'reste', 'autres?\\b', 'voir_tout', 'voir tout', 'et \\{n\\}',
  'plafond', 'tronqu', 'de plus', 'davantage',
  /* Une sortie vers la liste entière vaut aveu : « toutes les opportunités »,
   * « tous les concours ». C'est le cas de l'aperçu d'annonces sur une fiche de
   * spécialité — trois lignes, puis le lien vers le listing complet. */
  'tout(es|s)?[_ ]les', 'aper[çc]u',
].join('|'), 'i')

const suspects = []

for (const chemin of fichiers('app')) {
  const source = readFileSync(chemin, 'utf8')

  /* `slice` sur un tableau borné par un nombre : `slice(0, 3)` ou `slice(3)`.
   * On ignore `slice(0, N)` appliqué à une chaîne — le suffixe `'` ou `` ` ``
   * juste avant la variable le trahit rarement, donc on regarde plutôt si la
   * ligne parle d'une liste rendue. */
  const lignes = source.split('\n')

  lignes.forEach((ligne, i) => {
    if (!/\.slice\(\s*\d/.test(ligne)) return
    /* Une coupe de CHAÎNE n'est pas un plafond de liste : elles se reconnaissent
     * à ce qu'elles portent sur un texte, un corps de réponse ou un uuid. */
    if (/texte|corps|stem|uuid|message|slug|libell|label|nom\b|resume|description|extrait/i.test(ligne)) return

    /* L'aveu peut être dans les vingt lignes qui suivent — le commentaire, le
     * gabarit, ou la mention qui accompagne la liste. */
    const voisinage = lignes.slice(Math.max(0, i - 12), i + 24).join('\n')
    if (AVEUX.test(voisinage)) return

    suspects.push(`${chemin}:${i + 1}  ${ligne.trim()}`)
  })
}

assert.deepEqual(
  suspects,
  [],
  'plafond(s) SILENCIEUX sur une liste rendue :\n'
  + suspects.map(s => `    ${s}`).join('\n')
  + '\n\n    Montrez tout, ou dites qu’il y en a plus. Le silence n’est pas une'
  + ' option : un candidat qui ne trouve pas sa famille au menu conclut que le'
  + ' produit ne la couvre pas.',
)

/* Le cas d'origine, nommé, pour qu'une régression se lise dans le message. */
const mega = readFileSync('app/components/MegaConcours.vue', 'utf8')
assert.doesNotMatch(
  mega,
  /families\s*\?\?\s*\[\]\)\.slice\(/,
  'MegaConcours ne doit plus tronquer les familles d’une filière : c’est le'
  + ' défaut que M-021 a corrigé (un candidat COPS ne trouvait pas sa famille)',
)

console.log('ok — 2 contrôle(s) :')
console.log('  · aucune liste rendue ne se tronque en silence')
console.log('  · le panneau « Concours » montre toutes les familles d’une filière')
