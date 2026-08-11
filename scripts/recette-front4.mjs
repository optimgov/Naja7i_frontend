#!/usr/bin/env node
/**
 * recette-front4.mjs — la boucle quotidienne, cas par cas.
 *
 *   node scripts/recette-front4.mjs <email> <motDePasse> [codeEpreuve] [--partie 1|2]
 *
 * Partie 1 : l'entraînement ciblé (E7) et sa passation.
 * Partie 2 : les révisions (E8), la question miroir et le tableau de bord.
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const [email, motDePasse, codeEpreuve = 'CRMEF-FR-SPEC-2025'] = argv.filter((a) => !a.startsWith('--'))
const partie = argv.includes('--partie') ? argv[argv.indexOf('--partie') + 1] : 'toutes'

if (!email || !motDePasse) {
  console.error('Usage : node scripts/recette-front4.mjs <email> <motDePasse> [codeEpreuve] [--partie 1|2]')
  process.exit(2)
}

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SORTIE = process.env.SORTIE || '/tmp/recette-front4'

const resultats = []
const note = (cas, ok, constate) => {
  resultats.push({ cas, ok, constate })
  console.log(`${ok ? '  ok  ' : '  ✗   '}${cas}\n        ${constate}`)
}

const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } })
const page = await contexte.newPage()

const trafic = []
page.on('response', async (r) => {
  if (!r.url().includes('/api/')) return
  try {
    trafic.push({ methode: r.request().method(), url: r.url(), statut: r.status(), corps: await r.text() })
  } catch { /* corps consommé */ }
})

async function connecter() {
  await page.goto(`${BASE}/fr/connexion`, { waitUntil: 'networkidle' })
  if (page.url().includes('/app')) return
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', motDePasse)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/app', { timeout: 20000 })
}

async function api(chemin, options = {}) {
  return await page.evaluate(
    async ([c, o]) => {
      const r = await fetch(`/api/v1${c}`, {
        method: o.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': decodeURIComponent(
            (document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) ?? ['', ''])[1],
          ),
          ...(o.headers ?? {}),
        },
        body: o.body ? JSON.stringify(o.body) : undefined,
        credentials: 'include',
      })
      return { statut: r.status, corps: await r.text() }
    },
    [chemin, options],
  )
}

/** Répond à toute la série et la termine. Rend le nombre de questions vues. */
async function passerLaSerie() {
  let n = 0
  for (let i = 0; i < 45; i++) {
    if (!(await page.locator('.option').first().isVisible().catch(() => false))) break
    n += 1
    await page.locator('.option__choix').nth(i % 4).check()
    await page.locator('.certitude__radio').nth(i % 3).check()
    await page.locator('.passation__actes .btn').nth(1).click()
    await page.waitForTimeout(500)
    if (await page.locator('.voile').isVisible().catch(() => false)) {
      await page.locator('.voile__actes .btn').first().click()
      break
    }
  }
  await page.waitForURL('**/correction', { timeout: 30000 }).catch(() => {})
  return n
}

await connecter()

// ══════════════════════════════════════════════════════════ PARTIE 1 — E7
if (partie === '1' || partie === 'toutes') {
  await page.goto(`${BASE}/fr/app/entrainement/${codeEpreuve}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  // Les domaines proposés viennent de l'ordonnance, pas d'une seconde liste.
  {
    const choix = await page.locator('.choix').count()
    const plan = JSON.parse((await api(`/me/plan/${codeEpreuve}?limit=20`)).corps).data
    note(
      'E7 — les domaines proposés sont les lignes de l’ordonnance',
      choix === plan.length + 1,
      `${choix - 1} domaine(s) + « laisser choisir » · ordonnance : ${plan.length} ligne(s)`,
    )
    await page.screenshot({ path: `${SORTIE}-01-configurateur.png`, fullPage: true })
  }

  // Deux clics sur « lancer » → une seule tentative.
  {
    const avant = trafic.filter((t) => t.url.includes('/me/training/')).length
    const bouton = page.locator('button[type="submit"]')
    await bouton.click()
    const desactive = await bouton.isDisabled().catch(() => false)
    await page.waitForURL('**/app/tentative/**', { timeout: 20000 })

    const cle = `recette4-${Date.now()}`
    const a = await api(`/me/training/${codeEpreuve}`, {
      method: 'POST', headers: { 'Idempotency-Key': cle }, body: { total: 8 },
    })
    const b = await api(`/me/training/${codeEpreuve}`, {
      method: 'POST', headers: { 'Idempotency-Key': cle }, body: { total: 8 },
    })
    const memeUuid = JSON.parse(a.corps).data?.uuid === JSON.parse(b.corps).data?.uuid

    note(
      'deux clics sur « lancer »',
      desactive && memeUuid,
      `bouton désactivé : ${desactive} · deux POST à clé identique → même tentative : ${memeUuid} · `
        + `${trafic.filter((t) => t.url.includes('/me/training/')).length - avant} appel(s)`,
    )
  }

  const urlTentative = page.url()
  const uuidEntrainement = urlTentative.split('/app/tentative/')[1].split(/[?#]/)[0]

  // short_of_scope montré, et pas de chronomètre.
  {
    const ouverture = trafic.filter((t) => t.url.includes('/me/training/') && t.methode === 'POST').at(-1)
    const meta = JSON.parse(ouverture.corps).meta
    const banniere = await page.locator('.alerte--info').first().isVisible().catch(() => false)
    const texte = (await page.locator('.alerte--info').first().textContent().catch(() => '')) ?? ''
    const chrono = await page.locator('.passation__temps').count()

    note(
      'short_of_scope est montré',
      !meta.short_of_scope || (banniere && texte.includes(String(meta.served))),
      meta.short_of_scope
        ? `${meta.served}/${meta.requested} servies · bandeau affiché : ${banniere}`
        : `série complète (${meta.served}/${meta.requested}) — rien à annoncer`,
    )

    note(
      'aucun chronomètre en entraînement',
      chrono === 0,
      `seconds_remaining = ${JSON.parse(ouverture.corps).data.seconds_remaining} · éléments de décompte rendus : ${chrono}`,
    )
    await page.screenshot({ path: `${SORTIE}-02-passation-entrainement.png` })
  }

  // Passation complète, puis correction.
  {
    const vues = await passerLaSerie()
    await page.waitForTimeout(1200)

    const surCorrection = page.url().includes('/correction')
    const mention = await page.locator('.alerte--info').first().textContent().catch(() => '')
    const resultat = (await page.locator('.resultat').textContent().catch(() => ''))?.trim() ?? ''

    note(
      'entraînement passé de bout en bout',
      surCorrection && resultat.length > 0,
      `${vues} question(s) répondues · correction : « ${resultat} »`,
    )

    // Règle 1 : le score d'entraînement n'est jamais présenté comme une note.
    const attempt = JSON.parse((await api(`/me/attempts/${uuidEntrainement}`)).corps).data
    note(
      'score d’entraînement — jamais présenté comme une note d’épreuve',
      attempt.kind !== 'diagnostic' && /entraînement/i.test(mention ?? ''),
      `kind = ${attempt.kind} · mention avant le score : « ${(mention ?? '').trim().slice(0, 70)} »`,
    )
    await page.screenshot({ path: `${SORTIE}-03-correction-entrainement.png`, fullPage: true })
  }

  // Périmètre trop mince : un refus clair, aucune série vide.
  {
    const r = await api(`/me/training/${codeEpreuve}`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `etroit-${Date.now()}` },
      body: { node_uuid: '019ff000-0000-7000-8000-000000000000', total: 40 },
    })
    const j = JSON.parse(r.corps)
    note(
      'périmètre trop mince',
      r.statut === 409 || r.statut === 422 || j.error !== undefined,
      `${r.statut} ${j.error?.code ?? ''} — « ${(j.error?.message ?? '').slice(0, 80) }»`,
    )
  }

  // Bascule arabe sur E7.
  {
    await page.goto(`${BASE}/ar/app/entrainement/${codeEpreuve}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(600)
    const dir = await page.evaluate(() => document.documentElement.dir)
    const lang = await page.evaluate(() => document.documentElement.lang)
    /*
     * On ne contrôle que les libellés VENANT DE L'API — ceux des choix portant
     * `data-domaine`. La première version comptait tous les `.choix__libelle`
     * et signalait donc « laisser Naja7i choisir », une chaîne traduite déjà
     * dans la langue de la page : elle n'a que faire de `dir="auto"`.
     */
    const sansDir = await page.evaluate(
      () =>
        [...document.querySelectorAll('.choix[data-domaine] .choix__libelle')].filter(
          (e) => e.getAttribute('dir') !== 'auto',
        ).length,
    )
    const avecDir = await page.evaluate(
      () => document.querySelectorAll('.choix[data-domaine] .choix__libelle[dir="auto"]').length,
    )
    note(
      'bascule arabe sur E7',
      dir === 'rtl' && lang === 'ar' && sansDir === 0 && avecDir > 0,
      `dir=${dir}, lang=${lang} · ${avecDir} libellé(s) d’API avec dir="auto", ${sansDir} sans`,
    )
    await page.screenshot({ path: `${SORTIE}-04-e7-arabe.png`, fullPage: true })
  }
}

await navigateur.close()
writeFileSync(`${SORTIE}-resultats.json`, JSON.stringify(resultats, null, 2))

const echecs = resultats.filter((r) => !r.ok)
console.log(`\n── ${resultats.length - echecs.length}/${resultats.length} cas conformes ──`)
process.exit(echecs.length ? 1 : 0)
