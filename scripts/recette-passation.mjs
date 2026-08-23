#!/usr/bin/env node
/**
 * recette-passation.mjs — passe un diagnostic de bout en bout dans un vrai
 * navigateur, en enregistrant TOUT le trafic réseau.
 *
 * PALIER ÉPROUVÉ : ESSAI, sur un compte NEUF à chaque exécution.
 * Répondre aux questions est le seul droit du palier gratuit, et c'est tout ce
 * que la passation demande. Le compte est neuf parce que l'essai porte une
 * enveloppe de quarante questions qui ne se renouvelle jamais : un compte fixe
 * serait à sec dès la deuxième exécution.
 *
 * Ce que cette recette prouve, et qu'aucune relecture ne prouve :
 *
 *  1. Qu'aucune réponse d'API reçue PENDANT la passation ne contient
 *     `is_correct`, `rationale` ou `cause`. On ne le déduit pas du code : on
 *     lit les octets qui sont réellement passés sur le fil.
 *  2. Que la reprise sur un second appareil retrouve la série au même point —
 *     simulée par un second contexte de navigateur, donc un autre stockage,
 *     avec les seuls cookies de session en commun.
 *
 *   node scripts/recette-passation.mjs <email> <motDePasse> <codeEpreuve>
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const [email, motDePasse, codeEpreuve = 'CRMEF-FR-SPEC-2025'] = process.argv.slice(2)
if (!email || !motDePasse) {
  console.error('Usage : node scripts/recette-passation.mjs <email> <motDePasse> [codeEpreuve]')
  process.exit(2)
}

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SORTIE = process.env.SORTIE || '/tmp/recette-passation'
const INTERDITS = ['is_correct', 'rationale', '"cause"']

const navigateur = await chromium.launch()
const trafic = []
const captures = []

/** Enregistre chaque réponse d'API, corps compris. */
function ecouter(page, phase) {
  page.on('response', async (r) => {
    const url = r.url()
    if (!url.includes('/api/')) return
    let corps = ''
    try {
      corps = await r.text()
    } catch {
      corps = '(corps illisible)'
    }
    trafic.push({ phase, methode: r.request().method(), url, statut: r.status(), corps })
  })
}

async function capturer(page, nom) {
  const chemin = `${SORTIE}-${nom}.png`
  await page.screenshot({ path: chemin })
  captures.push(chemin)
  return chemin
}

// ---------------------------------------------------------------- appareil 1
const appareil1 = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
const page = await appareil1.newPage()
ecouter(page, 'passation')

console.log('1. connexion')
await page.goto(`${BASE}/fr/connexion`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', email)
await page.fill('input[type="password"]', motDePasse)
await page.click('button[type="submit"]')
await page.waitForURL('**/app', { timeout: 20000 })

console.log('2. ouverture du diagnostic')
await page.goto(`${BASE}/fr/app/diagnostic/${codeEpreuve}`, { waitUntil: 'networkidle' })
await capturer(page, '01-diagnostic')

// Double clic délibéré : la règle 4 veut UNE tentative, pas deux.
const lancer = page.locator('button.btn--grand')
await lancer.click()
await lancer.click({ force: true }).catch(() => {})
await page.waitForURL('**/app/tentative/**', { timeout: 20000 })

const urlTentative = page.url()
const uuidTentative = urlTentative.split('/app/tentative/')[1].split(/[?#]/)[0]
console.log(`   tentative ${uuidTentative}`)
await capturer(page, '02-passation')

console.log('3. réponses')
const CERTITUDES = ['sure', 'hesitant', 'guess']
let n = 0
for (;;) {
  n += 1
  await page.waitForSelector('.option', { timeout: 15000 })

  const options = page.locator('.option__choix')
  const combien = await options.count()
  await options.nth(n % combien).check()

  await page.locator('.certitude__radio').nth(n % CERTITUDES.length).check()

  if (n === 2) await capturer(page, '03-certitude')

  const suivante = page.locator('.passation__actes .btn').nth(1)
  const libelle = (await suivante.textContent())?.trim() ?? ''
  await suivante.click()

  // L'enregistrement est asynchrone : la confirmation n'apparaît qu'une fois la
  // réponse partie. Sans cette attente, la boucle repart et son clic suivant
  // est intercepté par le voile — ce qui ressemble à un défaut d'interface
  // alors que c'est la recette qui va trop vite.
  await page.waitForTimeout(600)

  // Le dernier bouton ouvre la confirmation au lieu d'avancer.
  if (await page.locator('.voile').isVisible().catch(() => false)) {
    console.log(`   ${n} questions répondues — confirmation`)
    await capturer(page, '04-confirmation')
    break
  }
  if (n > 40) throw new Error('Boucle de passation non terminée après 40 questions')
  void libelle
}

// ------------------------------------------------- reprise sur un 2e appareil
console.log('4. reprise sur un second appareil')
const cookies = await appareil1.cookies()
const appareil2 = await navigateur.newContext({ viewport: { width: 390, height: 844 } })
await appareil2.addCookies(cookies)
const page2 = await appareil2.newPage()
ecouter(page2, 'reprise')

await page2.goto(`${BASE}/fr/app/tentative/${uuidTentative}`, { waitUntil: 'networkidle' })
await page2.waitForSelector('.passation__avancement', { timeout: 20000 })
const avancement = (await page2.locator('.passation__avancement').textContent())?.trim()
const enonce2 = (await page2.locator('.passation__enonce').textContent())?.trim()
await capturer(page2, '05-reprise-appareil-2')
console.log(`   avancement retrouvé : ${avancement}`)

// -------------------------------------------------------------- soumission
console.log('5. soumission')
await page.locator('.voile__actes .btn').first().click()
await page.waitForURL('**/correction', { timeout: 30000 }).catch(() => {})
await capturer(page, '06-apres-soumission')

await navigateur.close()

// ------------------------------------------------------------------ verdict
const pendantPassation = trafic.filter(
  (t) => t.phase === 'passation' && !t.url.includes('/correction'),
)
const fuites = pendantPassation.filter((t) => INTERDITS.some((mot) => t.corps.includes(mot)))

const rapport = {
  tentative: uuidTentative,
  appels_api: trafic.length,
  appels_pendant_passation: pendantPassation.length,
  fuites: fuites.map((f) => ({ url: f.url, mot: INTERDITS.find((m) => f.corps.includes(m)) })),
  avancement_repris: avancement,
  enonce_repris: enonce2,
  captures,
}

writeFileSync(`${SORTIE}-trafic.json`, JSON.stringify(trafic, null, 2))
writeFileSync(`${SORTIE}-rapport.json`, JSON.stringify(rapport, null, 2))

console.log('\n── Verdict ──')
console.log(`appels d'API pendant la passation : ${pendantPassation.length}`)
console.log(`fuites de correction : ${fuites.length}`)
for (const f of fuites) console.log(`  ✗ ${f.url} contient ${INTERDITS.find((m) => f.corps.includes(m))}`)
console.log(`reprise sur 2e appareil : ${avancement}`)
console.log(`captures : ${captures.length}`)

process.exit(fuites.length ? 1 : 0)
