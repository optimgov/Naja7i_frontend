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
