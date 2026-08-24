#!/usr/bin/env node
/**
 * verifier-quantites-arabes.mjs — L'ACCORD DU NOM COMPTÉ, TENU.
 *
 *   npm run quantites
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 *
 * `/ar/tarifs` affichait « لمدة 30 أيام ». C'est fauté : l'arabe met le nom
 * compté au SINGULIER au-delà de dix. La cause n'était pas le libellé mais la
 * FORME de la clé — deux branches, celles du français, appliquées à une langue
 * qui en demande quatre.
 *
 * Corriger quatre libellés à la main n'aurait rien tenu : la cinquième quantité
 * ajoutée serait repartie à deux branches. Ce contrôle tient la forme.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA RÈGLE, ET SES QUATRE BRANCHES
 *
 *   1        singulier              يوم واحد
 *   2        duel                   يومان
 *   3 – 10   pluriel                أيام
 *   11 + (et 0)  singulier accusatif  يوما
 *
 * `i18n/vue-i18n.options.ts` porte la règle qui choisit l'index. Ce fichier
 * vérifie que les clés lui donnent de quoi choisir.
 *
 * RÉSERVE : l'auteur n'est pas arabophone natif. Ce contrôle porte sur la FORME
 * — le nombre de branches — qui est vérifiable sans l'être. Le choix des mots
 * sera relu par un arabophone au jalon 2.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fr = JSON.parse(readFileSync('i18n/locales/fr.json', 'utf8'))
const ar = JSON.parse(readFileSync('i18n/locales/ar.json', 'utf8'))
const options = readFileSync('i18n/vue-i18n.options.ts', 'utf8')
const config = readFileSync('nuxt.config.ts', 'utf8')

/** Toute valeur qui interpole un nombre ET porte des branches de pluriel. */
function quantites(dico, prefixe = '', trouvees = []) {
  for (const [cle, valeur] of Object.entries(dico)) {
    const chemin = `${prefixe}${cle}`
    if (valeur !== null && typeof valeur === 'object') quantites(valeur, `${chemin}.`, trouvees)
    else if (typeof valeur === 'string' && valeur.includes('|') && valeur.includes('{n}')) {
      trouvees.push([chemin, valeur])
    }
  }
  return trouvees
}

const cas = []

/*
 * LA RÈGLE EST BRANCHÉE. Sans `vueI18n` dans la configuration, le fichier
 * d'options n'est jamais chargé : les quatre branches seraient là, et
 * `vue-i18n` continuerait d'appliquer la règle du français. Le défaut serait
 * INVISIBLE — les libellés justes, et le mauvais choisi.
 */
assert.match(
  config,
  /vueI18n:\s*'\.\/vue-i18n\.options\.ts'/,
  'nuxt.config.ts doit déclarer `vueI18n` : sans lui, la règle arabe n’est jamais'
  + ' chargée et les quatre branches ne servent à rien',
)
cas.push('la règle de pluriel arabe est branchée dans la configuration')

assert.match(
  options,
  /ar:\s*\(/,
  'i18n/vue-i18n.options.ts doit porter une règle pour `ar`',
)
cas.push('une règle de pluriel existe pour l’arabe')

/*
 * CHAQUE QUANTITÉ ARABE PORTE QUATRE BRANCHES. Trois ne suffisent pas : le duel
 * et le singulier accusatif sont deux formes distinctes, et les confondre
 * refait la faute d'origine sous une autre main.
 */
const arabes = quantites(ar)
assert.ok(arabes.length > 0, 'aucune quantité arabe trouvée — le contrôle ne mesurerait rien')

for (const [chemin, valeur] of arabes) {
  const branches = valeur.split('|').length
  assert.equal(
    branches,
    4,
    `${chemin} porte ${branches} branche(s) au lieu de 4.\n`
    + `    « ${valeur} »\n`
    + '    L’arabe accorde le nom compté : 1 singulier · 2 duel · 3-10 pluriel ·'
    + ' 11+ singulier accusatif. Deux branches produisent « 30 أيام », qui est fauté.',
  )
}
cas.push(`${arabes.length} quantité(s) arabe(s), toutes à quatre branches`)

/*
 * LA PARITÉ NE S'INVERSE PAS. Une quantité qui existe en arabe doit exister en
 * français — sans quoi la clé est orpheline et l'écran français afficherait son
 * propre nom de clé.
 */
const cheminsFr = new Set(quantites(fr).map(([c]) => c))
for (const [chemin] of arabes) {
  assert.ok(cheminsFr.has(chemin), `${chemin} existe en arabe et manque en français`)
}
cas.push('chaque quantité arabe a sa jumelle française')

/*
 * AUCUN NOMBRE COLLÉ À SON NOM SANS FINE INSÉCABLE — la règle du dépôt. On ne
 * la vérifie que sur les quantités, là où le nombre et le mot se touchent.
 */
for (const [chemin, valeur] of arabes) {
  assert.doesNotMatch(
    valeur,
    /\{n\}\u0020{2,}/,
    `${chemin} porte une double espace autour de {n}`,
  )
}
cas.push('aucune espace parasite autour du nombre')

console.log(`ok — ${cas.length} contrôle(s) :`)
for (const nom of cas) console.log(`  · ${nom}`)
