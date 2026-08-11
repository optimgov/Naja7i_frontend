#!/usr/bin/env node
/* =====================================================================
   Validateur de jetons de conception — socle UI vérifiable
   Aucune dépendance. Node 18+.

   Il lit un fichier CSS de jetons, résout les `var()`, et échoue si une
   règle est enfreinte. But : rendre les contraintes d'interface
   VÉRIFIABLES plutôt que déclaratives, donc exécutables en intégration
   continue, avant la revue humaine.

   Usage
     node valider-jetons.mjs                        # jetons.config.json
     node valider-jetons.mjs mon.config.json
     node valider-jetons.mjs --init [chemin.css]    # écrit un config de départ
     node valider-jetons.mjs --json                 # sortie machine
     node valider-jetons.mjs --quiet                # seulement les échecs

   Codes de sortie : 0 tout passe · 1 au moins un échec · 2 erreur d'usage.

   RÈGLES DISPONIBLES
     contrastes    ratio WCAG entre deux jetons, dans chaque thème
     series        distinction des couleurs catégorielles en dichromatie
     separations   deux jetons doivent rester perceptuellement distincts
     achromatiques une échelle qui ne doit pas préjuger reste neutre
     parite        chaque rôle du thème de référence est redéfini ailleurs
     presence      un jeton existe et dépasse une valeur minimale
     interdits     motif regex qui ne doit pas apparaître dans le CSS
     exigences     motif regex qui DOIT apparaître dans le CSS
   ===================================================================== */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2)
const drapeau = (n) => args.includes(n)
const JSON_OUT = drapeau('--json')
const QUIET = drapeau('--quiet')

const CONFIG_DEFAUT = {
  css: 'tokens.css',
  themes: { clair: ':root', sombre: ":root[data-theme='sombre']" },
  themeReference: 'clair',
  seuils: { texte: 4.5, nonTexte: 3.0, dichromatie: 40, separation: 30, saturation: 24 },
  contrastes: [
    { id: 'CTR-01', fg: '--texte', bg: '--fond', type: 'texte' },
    { id: 'CTR-02', fg: '--texte-doux', bg: '--fond', type: 'texte' },
    { id: 'CTR-03', fg: '--texte-tenu', bg: '--fond', type: 'texte', note: 'placeholder et mentions' },
    { id: 'CTR-04', fg: '--lien', bg: '--fond', type: 'texte' },
    { id: 'NTX-01', fg: '--bordure-forte', bg: '--surface', type: 'nonTexte', note: 'contour de champ de saisie (WCAG 1.4.11)' },
    { id: 'NTX-02', fg: '--focus', bg: '--fond', type: 'nonTexte', note: 'anneau de focus' },
    { id: 'NTX-03', fg: '--accent', bg: '--fond', type: 'nonTexte', note: 'aplat du bouton principal' },
  ],
  series: [],
  separations: [],
  achromatiques: [],
  parite: { prefixes: ['--fond', '--surface', '--texte', '--bordure', '--accent', '--lien', '--focus'], ignorer: [] },
  presence: [],
  interdits: [
    {
      id: 'RTL-01',
      regex: '(?:^|[\\s;{])(margin|padding|border)-(left|right)\\s*:',
      message: 'propriété physique gauche/droite — utiliser les propriétés logiques pour que le RTL soit natif',
    },
  ],
  exigences: [
    { id: 'MOV-01', regex: 'prefers-reduced-motion', message: 'prise en charge de prefers-reduced-motion' },
  ],
}

if (drapeau('--init')) {
  const css = args.find((a) => a.endsWith('.css')) ?? 'tokens.css'
  const cible = resolve('jetons.config.json')
  if (existsSync(cible)) {
    console.error(`jetons.config.json existe déjà — supprimez-le ou éditez-le à la main.`)
    process.exit(2)
  }
  writeFileSync(cible, JSON.stringify({ ...CONFIG_DEFAUT, css }, null, 2) + '\n')
  console.log(`Écrit : ${cible}
Adaptez « css », les noms de jetons et les seuils à votre projet, puis relancez
sans --init. Les listes vides (series, separations, achromatiques, presence)
sont des emplacements à remplir : ce sont elles qui portent les règles propres
à votre domaine.`)
  process.exit(0)
}

const cheminConfig = resolve(args.find((a) => a.endsWith('.json')) ?? 'jetons.config.json')
let cfg = CONFIG_DEFAUT
if (existsSync(cheminConfig)) {
  const perso = JSON.parse(readFileSync(cheminConfig, 'utf8'))
  cfg = { ...CONFIG_DEFAUT, ...perso, seuils: { ...CONFIG_DEFAUT.seuils, ...(perso.seuils ?? {}) } }
} else if (!args.some((a) => a.endsWith('.css'))) {
  console.error(`Aucun ${cheminConfig}. Lancez d'abord :  node valider-jetons.mjs --init chemin/vers/tokens.css`)
  process.exit(2)
}

const cheminCss = resolve(args.find((a) => a.endsWith('.css')) ?? cfg.css)
if (!existsSync(cheminCss)) {
  console.error(`Fichier CSS introuvable : ${cheminCss}`)
  process.exit(2)
}
const css = readFileSync(cheminCss, 'utf8')

/* ------------------------------------------------------------------ */
/* Extraction des jetons                                               */
/* ------------------------------------------------------------------ */

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Concatène le corps de TOUS les blocs correspondant au sélecteur.
 *  `:root` apparaît souvent plusieurs fois (rampes, rôles, alias). */
function corpsDe(selecteur) {
  const sel = echapper(selecteur)
  // `:root` ne doit pas capturer `:root[data-theme=…]`
  const garde = selecteur === ':root' ? '(?!\\[)' : ''
  const re = new RegExp(`${sel}${garde}\\s*\\{([^}]*)\\}`, 'g')
  return [...css.matchAll(re)].map((m) => m[1]).join('\n')
}

function jetonsDe(corps) {
  const out = {}
  for (const [, nom, val] of corps.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[nom] = val.trim()
  return out
}

const tablesBrutes = {}
for (const [nom, sel] of Object.entries(cfg.themes)) tablesBrutes[nom] = jetonsDe(corpsDe(sel))

const REF = cfg.themeReference in tablesBrutes ? cfg.themeReference : Object.keys(tablesBrutes)[0]
const tables = {}
for (const nom of Object.keys(tablesBrutes)) {
  // Un thème hérite du thème de référence pour tout ce qu'il ne redéfinit pas.
  tables[nom] = nom === REF ? tablesBrutes[nom] : { ...tablesBrutes[REF], ...tablesBrutes[nom] }
}

function resoudre(table, nom, profondeur = 0) {
  if (profondeur > 12) return null
  const v = table[nom]
  if (!v) return null
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/)
  if (ref) return resoudre(table, ref[1], profondeur + 1)
  const hex = v.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hex) return normaliser(v)
  const rgbm = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
  if (rgbm) return '#' + rgbm.slice(1, 4).map((x) => (+x).toString(16).padStart(2, '0')).join('').toUpperCase()
  return null // clamp(), url(), gradient… hors périmètre colorimétrique
}

function normaliser(h) {
  h = h.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return '#' + h.toUpperCase()
}

/* ------------------------------------------------------------------ */
/* Colorimétrie                                                        */
/* ------------------------------------------------------------------ */

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }

function contraste(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

// Matrices de simulation des dichromaties (Machado, Oliveira & Fernandes, sévérité 1.0)
const DICHRO = {
  protanopie: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopie: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritanopie: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}

function simuler(hex, M) {
  const v = rgb(hex)
  return '#' + M.map((row) => Math.max(0, Math.min(255, Math.round(row.reduce((s, k, i) => s + k * v[i], 0)))))
    .map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}

const distance = (a, b) => Math.hypot(...rgb(a).map((x, i) => x - rgb(b)[i]))

/* ------------------------------------------------------------------ */
/* Exécution des règles                                                */
/* ------------------------------------------------------------------ */

const resultats = []
const noter = (regle, ok, detail) => resultats.push({ regle, ok, detail })

for (const [theme, table] of Object.entries(tables)) {
  for (const c of cfg.contrastes ?? []) {
    const seuil = c.seuil ?? cfg.seuils[c.type ?? 'texte'] ?? cfg.seuils.texte
    const fg = resoudre(table, c.fg)
    const bg = resoudre(table, c.bg)
    const nom = `${c.id} [${theme}]`
    if (!fg || !bg) { noter(nom, false, `jeton introuvable ou non résoluble : ${!fg ? c.fg : c.bg}`); continue }
    const r = contraste(fg, bg)
    noter(nom, r >= seuil,
      `${c.fg} ${fg} sur ${c.bg} ${bg} → ${r.toFixed(2)}:1 (seuil ${seuil})${c.note ? ' · ' + c.note : ''}`)
  }

  const series = (cfg.series ?? []).map((n) => resoudre(table, n))
  if (series.length >= 2 && series.every(Boolean)) {
    // Lisibles sur le fond…
    const fond = resoudre(table, cfg.serieFond ?? '--fond')
    if (fond) {
      series.forEach((s, i) => {
        const r = contraste(s, fond)
        noter(`DAT-${i + 1} [${theme}]`, r >= cfg.seuils.nonTexte,
          `${cfg.series[i]} ${s} sur fond ${fond} → ${r.toFixed(2)}:1 (seuil ${cfg.seuils.nonTexte})`)
      })
    }
    // …et distinguables même sans perception des couleurs.
    for (const [nom, M] of Object.entries(DICHRO)) {
      let min = Infinity, pire = ''
      for (let i = 0; i < series.length; i++)
        for (let j = i + 1; j < series.length; j++) {
          const d = distance(simuler(series[i], M), simuler(series[j], M))
          if (d < min) { min = d; pire = `${cfg.series[i]}/${cfg.series[j]}` }
        }
      noter(`CVD-${nom} [${theme}]`, min >= cfg.seuils.dichromatie,
        `distance minimale ${min.toFixed(0)} sur 255 (${pire}, seuil ${cfg.seuils.dichromatie})`)
    }
  }
}

for (const s of cfg.separations ?? []) {
  const table = tables[REF]
  const a = resoudre(table, s.a), b = resoudre(table, s.b)
  const min = s.min ?? cfg.seuils.separation
  if (!a || !b) { noter(s.id, false, `jeton introuvable : ${!a ? s.a : s.b}`); continue }
  const d = distance(a, b)
  noter(s.id, a !== b && d >= min,
    `${s.a} ${a} vs ${s.b} ${b} → distance ${d.toFixed(0)} (seuil ${min})${s.note ? ' · ' + s.note : ''}`)
}

for (const a of cfg.achromatiques ?? []) {
  const table = tables[REF]
  const maxSat = a.maxSaturation ?? cfg.seuils.saturation
  const fautifs = []
  for (const n of a.jetons ?? []) {
    const h = resoudre(table, n)
    if (!h) { fautifs.push(`${n} introuvable`); continue }
    const [r, g, b] = rgb(h)
    const sat = Math.max(r, g, b) - Math.min(r, g, b)
    if (sat > maxSat) fautifs.push(`${n} ${h} (écart ${sat} > ${maxSat})`)
  }
  noter(a.id, fautifs.length === 0,
    fautifs.length ? `teinte colorée dans une échelle qui doit rester neutre : ${fautifs.join(', ')}` : `${a.jetons.length} jeton(s) neutres${a.note ? ' · ' + a.note : ''}`)
}

/* Un sélecteur de thème qui ne correspond à rien produirait un thème
   « conforme » par héritage silencieux — exactement le genre de faux
   négatif que ce validateur existe pour empêcher. On le signale. */
for (const [theme, sel] of Object.entries(cfg.themes)) {
  const vide = Object.keys(tablesBrutes[theme]).length === 0
  if (vide) noter(`SEL-${theme}`, false, `le sélecteur « ${sel} » ne correspond à aucun bloc du CSS — vérifiez « themes » dans la configuration`)
}

if (cfg.parite?.prefixes?.length) {
  const autres = Object.keys(cfg.themes).filter((t) => t !== REF)
  for (const theme of autres) {
    const brut = tablesBrutes[theme]
    if (Object.keys(brut).length === 0) continue // déjà signalé par SEL-*
    const roles = Object.keys(tablesBrutes[REF]).filter(
      (n) =>
        cfg.parite.prefixes.some((p) => n.startsWith(p)) &&
        !(cfg.parite.ignorer ?? []).some((p) => n.startsWith(p)) &&
        // Un alias `--x: var(--y)` hérite du thème par sa cible : on ne l'exige
        // pas ici, la cible est vérifiée à sa place.
        !(tablesBrutes[REF][n]?.startsWith('var(') &&
          brut[tablesBrutes[REF][n].match(/--[\w-]+/)[0]] !== undefined),
    )
    const manquants = roles.filter((n) => !(n in brut))
    noter(`PAR-${theme}`, manquants.length === 0,
      manquants.length
        ? `${manquants.length} rôle(s) non redéfini(s) : ${manquants.join(', ')}`
        : `${roles.length} rôle(s) du thème « ${REF} » redéfinis en « ${theme} »`)
  }
}

for (const p of cfg.presence ?? []) {
  const v = tables[REF][p.jeton]
  const n = v && parseFloat(v)
  const ok = v !== undefined && (p.min === undefined || (Number.isFinite(n) && n >= p.min))
  noter(p.id, ok, v === undefined ? `jeton ${p.jeton} absent` : `${p.jeton} = ${v}${p.min !== undefined ? ` (minimum ${p.min})` : ''}${p.note ? ' · ' + p.note : ''}`)
}

for (const i of cfg.interdits ?? []) {
  const trouve = [...css.matchAll(new RegExp(i.regex, 'gm'))].map((m) => m[0].trim())
  noter(i.id, trouve.length === 0,
    trouve.length ? `${trouve.length} occurrence(s) : ${[...new Set(trouve)].slice(0, 6).join(', ')} — ${i.message ?? ''}` : (i.message ?? 'aucune occurrence'))
}

for (const e of cfg.exigences ?? []) {
  const ok = new RegExp(e.regex, 'm').test(css)
  noter(e.id, ok, e.message ?? e.regex)
}

/* ------------------------------------------------------------------ */
/* Rapport                                                             */
/* ------------------------------------------------------------------ */

const echecs = resultats.filter((r) => !r.ok)

if (JSON_OUT) {
  console.log(JSON.stringify({ css: cheminCss, total: resultats.length, echecs: echecs.length, resultats }, null, 2))
  process.exit(echecs.length ? 1 : 0)
}

const couleur = process.stdout.isTTY && !process.env.NO_COLOR
const vert = (s) => (couleur ? `\x1b[32m${s}\x1b[0m` : s)
const rouge = (s) => (couleur ? `\x1b[31m${s}\x1b[0m` : s)
const gris = (s) => (couleur ? `\x1b[90m${s}\x1b[0m` : s)

console.log(`\nValidateur de jetons — ${cheminCss}\n${'─'.repeat(74)}`)
if (!QUIET) for (const r of resultats.filter((r) => r.ok)) console.log(gris('  ok  ') + `${r.regle} ${r.detail}`)
if (echecs.length) {
  console.log(`\n${rouge('ÉCHECS')}`)
  for (const r of echecs) console.log(rouge('  ✗   ') + `${r.regle} ${r.detail}`)
}
console.log('─'.repeat(74))
console.log(`${resultats.length - echecs.length} règle(s) satisfaite(s), ${echecs.length ? rouge(echecs.length + ' échec(s)') : vert('0 échec')}\n`)
process.exit(echecs.length ? 1 : 0)
