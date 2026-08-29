#!/usr/bin/env node
/* =====================================================================
   Parité des locales et propriétés logiques — contrôles d'intégration.
   Aucune dépendance. Sort en code 1 si une règle est enfreinte.

   Deux défauts que la compilation ne voit pas :

   1. Une clé ajoutée en français et oubliée en arabe. Nuxt affiche alors la
      clé brute — « catalogue.epreuves » — à un lecteur arabophone, et
      personne du côté français ne s'en aperçoit jamais.

   2. Une propriété physique (margin-left, text-align: right) dans une feuille
      de composant. Elle passe inaperçue en français et casse la mise en page
      arabe. C'est le défaut le moins visible en revue et le plus visible à
      l'usage.
   ===================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import process from 'node:process'

let echecs = 0

function noter(ok, id, message) {
  console.log(`  ${ok ? 'ok ' : '✗  '} ${id} ${message}`)
  if (!ok) echecs++
}

/* --- 1. Parité fr / ar ------------------------------------------------ */

function feuilles(objet, prefixe = '') {
  const sortie = []
  for (const [cle, valeur] of Object.entries(objet)) {
    if (valeur && typeof valeur === 'object' && !Array.isArray(valeur)) {
      sortie.push(...feuilles(valeur, `${prefixe}${cle}.`))
    } else {
      sortie.push(`${prefixe}${cle}`)
    }
  }
  return sortie
}

const fr = JSON.parse(readFileSync('i18n/locales/fr.json', 'utf8'))
const ar = JSON.parse(readFileSync('i18n/locales/ar.json', 'utf8'))

const clesFr = new Set(feuilles(fr))
const clesAr = new Set(feuilles(ar))

const manquantesAr = [...clesFr].filter((k) => !clesAr.has(k))
const manquantesFr = [...clesAr].filter((k) => !clesFr.has(k))

noter(
  manquantesAr.length === 0,
  'I18N-01',
  manquantesAr.length
    ? `${manquantesAr.length} clé(s) absente(s) de ar.json : ${manquantesAr.slice(0, 8).join(', ')}`
    : `parité fr/ar tenue — ${clesFr.size} clés de chaque côté`,
)

noter(
  manquantesFr.length === 0,
  'I18N-02',
  manquantesFr.length
    ? `${manquantesFr.length} clé(s) absente(s) de fr.json : ${manquantesFr.slice(0, 8).join(', ')}`
    : 'aucune clé orpheline côté arabe',
)

/* Une valeur arabe identique à la valeur française trahit une traduction
   oubliée — sauf pour les chaînes qui n'ont pas à être traduites. */
const identiques = [...clesFr].filter((k) => {
  if (!clesAr.has(k)) return false
  const lire = (o) => k.split('.').reduce((acc, p) => acc?.[p], o)
  const a = lire(fr)
  const b = lire(ar)
  return typeof a === 'string' && a === b && a.trim().length > 3
})

noter(
  identiques.length === 0,
  'I18N-03',
  identiques.length
    ? `${identiques.length} valeur(s) identique(s) en fr et ar : ${identiques.slice(0, 6).join(', ')}`
    : 'aucune valeur française laissée dans ar.json',
)

/* --- 1bis. Toute clé APPELÉE existe-t-elle ? --------------------------- *
 *
 * TROISIÈME DÉFAUT QUE LA COMPILATION NE VOIT PAS, et il est plus grave que
 * les deux autres : une clé appelée mais jamais définie s'affiche TELLE QUELLE
 * à l'écran. `t('navigation.inscription')` sur une clé absente rend
 * « navigation.inscription » dans le pied de page, en français comme en arabe.
 *
 * La parité fr/ar ne l'attrape pas — la clé manque des DEUX côtés, donc la
 * parité est tenue. Le typage ne l'attrape pas non plus : `t()` prend une
 * chaîne. Seul un regard sur l'écran le voyait, et c'est exactement ce qui
 * s'est produit au lot ZP-1, sur une capture.
 *
 * On ne lit que les appels à clé LITTÉRALE. Les clés construites —
 * `t(\`opportunites.type_${code}\`)` — sont hors de portée d'une analyse
 * statique, et le code qui les emploie passe déjà par `te()` pour se rabattre
 * sur une valeur lisible plutôt que sur la clé.
 * --------------------------------------------------------------------- */

const SOURCES = ['app', 'server']

function fichiersSources() {
  const sortie = []
  const parcourir = (racine) => {
    for (const entree of readdirSync(racine)) {
      const chemin = join(racine, entree)
      if (statSync(chemin).isDirectory()) parcourir(chemin)
      else if (['.vue', '.ts', '.mjs'].includes(extname(chemin))) sortie.push(chemin)
    }
  }
  for (const racine of SOURCES) {
    try { parcourir(racine) } catch { /* dossier absent */ }
  }
  return sortie
}

const definies = new Set(feuilles(fr))
const appelees = new Map()

for (const fichier of fichiersSources()) {
  const source = readFileSync(fichier, 'utf8')
  /* `t('x.y')` et `te('x.y')`, guillemets simples ou doubles. Les gabarits
   * littéraux sont volontairement exclus — voir l'en-tête. */
  for (const m of source.matchAll(/\bt[e]?\(\s*['"]([a-z][a-zA-Z0-9_.]*)['"]/g)) {
    if (!appelees.has(m[1])) appelees.set(m[1], fichier)
  }
}

const absentes = [...appelees.entries()].filter(([cle]) => !definies.has(cle))

noter(
  absentes.length === 0,
  'I18N-04',
  absentes.length
    ? `${absentes.length} clé(s) appelée(s) mais jamais définie(s) — elles s'affichent telles quelles : `
      + absentes.slice(0, 5).map(([c, f]) => `${c} (${f})`).join(', ')
    : `aucune clé orpheline à l'appel — ${appelees.size} clés littérales vérifiées`,
)

/* --- 1 bis. Les guides d'écran ----------------------------------------- */
/*
 * I18N-05 — LA CLÉ D'UN GUIDE EST CONSTRUITE, DONC I18N-04 NE LA VOIT PAS.
 *
 * `<GuideEcran cle="maitrise" />` fait résoudre au composant
 * `guide.maitrise.titre`, `.role` et `.gestes`. Aucune de ces trois chaînes
 * n'apparaît littéralement dans une source : la règle précédente, qui ne lit
 * que les littéraux, les ignore toutes. Une faute de frappe dans `cle` ne
 * casserait donc rien — elle afficherait « guide.maitrisse.titre » à un
 * candidat, en toutes lettres, et aucun contrôle ne rougirait.
 *
 * On relit donc les clés déclarées dans les gabarits, et on exige leur bloc.
 */
const guidesAppeles = new Map()

for (const fichier of fichiersSources()) {
  for (const m of readFileSync(fichier, 'utf8').matchAll(/<GuideEcran\s+cle="([a-z0-9_]+)"/g)) {
    if (!guidesAppeles.has(m[1])) guidesAppeles.set(m[1], fichier)
  }
}

const guidesIncomplets = [...guidesAppeles.entries()].flatMap(([cle, fichier]) =>
  ['titre', 'role', 'gestes']
    .filter((rubrique) => !definies.has(`guide.${cle}.${rubrique}`))
    .map((rubrique) => `guide.${cle}.${rubrique} (${fichier})`),
)

noter(
  guidesIncomplets.length === 0,
  'I18N-05',
  guidesIncomplets.length
    ? `${guidesIncomplets.length} rubrique(s) de guide manquante(s) : ${guidesIncomplets.slice(0, 5).join(', ')}`
    : `les ${guidesAppeles.size} guides d'écran ont leur titre, leur rôle et leurs gestes`,
)

/* --- 2. Propriétés logiques ------------------------------------------- */

const PHYSIQUES = [
  /(?:^|[\s;{])(?:margin|padding|border|inset)-(?:left|right)\s*:/gm,
  /(?:^|[\s;{])text-align\s*:\s*(?:left|right)\b/gm,
  /(?:^|[\s;{])float\s*:\s*(?:left|right)\b/gm,
]

function fichiersDe(racine, extensions) {
  const sortie = []
  for (const entree of readdirSync(racine)) {
    const chemin = join(racine, entree)
    if (statSync(chemin).isDirectory()) {
      sortie.push(...fichiersDe(chemin, extensions))
    } else if (extensions.includes(extname(chemin))) {
      sortie.push(chemin)
    }
  }
  return sortie
}

const fautifs = []

for (const chemin of [...fichiersDe('app', ['.vue', '.css']), ...fichiersDe('assets', ['.css'])]) {
  const source = readFileSync(chemin, 'utf8')
  for (const motif of PHYSIQUES) {
    for (const trouve of source.matchAll(motif)) {
      fautifs.push(`${chemin} : ${trouve[0].trim()}`)
    }
  }
}

noter(
  fautifs.length === 0,
  'RTL-03',
  fautifs.length
    ? `${fautifs.length} propriété(s) physique(s) : ${fautifs.slice(0, 6).join(' | ')}`
    : 'aucune propriété physique dans les composants',
)

console.log(
  echecs === 0
    ? `\n${4 - echecs} règle(s) satisfaite(s), 0 échec`
    : `\n${4 - echecs} règle(s) satisfaite(s), ${echecs} échec(s)`,
)

process.exit(echecs === 0 ? 0 : 1)
