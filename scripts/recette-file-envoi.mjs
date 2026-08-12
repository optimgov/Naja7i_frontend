#!/usr/bin/env node
/**
 * recette-file-envoi.mjs — les deux bloquants de l'audit tournée 2.
 *
 *   node scripts/recette-file-envoi.mjs <emailA> <mdpA> <emailB> <mdpB> [codeEpreuve]
 *
 * BLOC-4 — propriétaire et coordination entre onglets.
 * BLOC-5 — un refus définitif ne disparaît pas et bloque la soumission.
 * SSR    — aucune fuite de correction dans le HTML authentifié d'une passation.
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const [emailA, mdpA, emailB, mdpB, codeEpreuve = 'CRMEF-FR-SPEC-2025'] = process.argv.slice(2)
if (!emailA || !mdpA || !emailB || !mdpB) {
  console.error('Usage : node scripts/recette-file-envoi.mjs <emailA> <mdpA> <emailB> <mdpB> [codeEpreuve]')
  process.exit(2)
}

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SORTIE = process.env.SORTIE || '/tmp/recette-file'
const CLE = 'naja7i.file-envoi'

const resultats = []
const note = (cas, ok, constate) => {
  resultats.push({ cas, ok, constate })
  console.log(`${ok ? '  ok  ' : '  ✗   '}${cas}\n        ${constate}`)
}

const navigateur = await chromium.launch()

async function connecter(page, email, mdp) {
  await page.goto(`${BASE}/fr/connexion`, { waitUntil: 'networkidle' })
  if (page.url().includes('/app')) {
    await page.click('header button:last-of-type').catch(() => {})
    await page.waitForTimeout(1200)
    await page.goto(`${BASE}/fr/connexion`, { waitUntil: 'networkidle' })
  }
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', mdp)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/app', { timeout: 20000 })
}

async function api(page, chemin, options = {}) {
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

const lireFile = (page) =>
  page.evaluate((k) => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? 'null')
    } catch {
      return null
    }
  }, CLE)

// ════════════════════════════════════════════════ BLOC-4 — deux onglets
{
  /* Deux contextes distincts partageant le MÊME profil de stockage n'existent
   * pas dans Playwright : on ouvre donc deux PAGES du même contexte, ce qui est
   * exactement la situation visée — deux onglets, un seul localStorage. */
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
  const ongletA = await contexte.newPage()
  const ongletB = await contexte.newPage()

  await connecter(ongletA, emailA, mdpA)

  const ouvert = await api(ongletA, `/me/diagnostics/${codeEpreuve}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `file-${Date.now()}` },
    body: { total: 5 },
  })
  const attempt = JSON.parse(ouvert.corps).data

  if (!attempt) {
    note('BLOC-4 — deux onglets', false, `impossible d'ouvrir une série : ${ouvert.corps.slice(0, 120)}`)
  } else {
    const url = `${BASE}/fr/app/tentative/${attempt.uuid}`
    await ongletA.goto(url, { waitUntil: 'networkidle' })
    await ongletB.goto(url, { waitUntil: 'networkidle' })
    await ongletA.waitForSelector('.option', { timeout: 15000 })
    await ongletB.waitForSelector('.option', { timeout: 15000 })

    // Les deux onglets tombent hors connexion, puis répondent chacun à UNE
    // question différente, simultanément.
    await contexte.setOffline(true)

    /*
     * L'onglet B répond à la question 1 PUIS à la question 2 : hors connexion,
     * « suivante » met en file et avance quand même. L'onglet A, lui, ne répond
     * qu'à la question 1.
     *
     * Ce qu'on vérifie n'est donc pas que deux écritures simultanées coexistent
     * — le dédoublonnage par chemin les fondrait à juste titre — mais que
     * l'écriture de A NE FAIT PAS DISPARAÎTRE l'item 2 posé par B. C'était
     * exactement le défaut : chaque onglet réécrivait le tableau qu'il avait en
     * mémoire.
     */
    await Promise.all([
      (async () => {
        await ongletB.locator('.option__choix').nth(0).check()
        await ongletB.locator('.certitude__radio').nth(0).check()
        await ongletB.locator('.passation__actes .btn').nth(1).click()
        await ongletB.waitForTimeout(900)
        await ongletB.locator('.option__choix').nth(1).check()
        await ongletB.locator('.certitude__radio').nth(1).check()
        await ongletB.locator('.passation__actes .btn').nth(1).click()
      })(),
      (async () => {
        await ongletA.waitForTimeout(300)
        await ongletA.locator('.option__choix').nth(2).check()
        await ongletA.locator('.certitude__radio').nth(2).check()
        await ongletA.locator('.passation__actes .btn').nth(1).click()
      })(),
    ])

    await ongletA.waitForTimeout(2500)

    const env = await lireFile(ongletA)
    const entrees = env?.entries ?? []
    const distinctes = new Set(entrees.map((e) => e.chemin)).size

    note(
      'BLOC-4 — deux onglets hors connexion ne s’écrasent pas',
      Array.isArray(entrees) && entrees.length >= 2 && distinctes === entrees.length,
      `${entrees.length} entrée(s) persistée(s), ${distinctes} chemin(s) distinct(s) · `
        + `propriétaire : ${env?.ownerUserUuid ? env.ownerUserUuid.slice(0, 8) + '…' : 'aucun'}`,
    )

    // Retour du réseau : les deux partent, dans l'ordre de pose.
    const emis = []
    ongletA.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/items/')) emis.push(r.url())
    })

    await contexte.setOffline(false)
    await ongletA.evaluate(() => window.dispatchEvent(new Event('online')))
    await ongletA.waitForTimeout(4000)

    const restant = (await lireFile(ongletA))?.entries ?? []
    note(
      'BLOC-4 — les deux entrées partent au retour du réseau',
      emis.length >= 2 && restant.length === 0,
      `${emis.length} PUT émis · file résiduelle : ${restant.length}`,
    )
  }

  // ─────────────── reconnexion d'un AUTRE compte : la file A ne part pas
  {
    /*
     * La file est POSÉE directement dans le stockage, au nom de A.
     *
     * Passer par le réseau ne marche pas : rétablir la connexion pour pouvoir
     * se connecter en B écoule d'abord la file — sous A, et à juste titre. Le
     * cas à éprouver n'est pas « A envoie ses réponses », c'est « une file de A
     * survit à une connexion de B sans partir sous la mauvaise identité ».
     */
    const uuidA = await ongletA.evaluate(async () => {
      const r = await fetch('/api/v1/me', { credentials: 'include', headers: { Accept: 'application/json' } })
      return (await r.json()).data.uuid
    })

    /*
     * On se DÉCONNECTE avant de poser la file.
     *
     * Sinon la séquence de connexion passe par `/connexion`, d'où la garde
     * `guest` renvoie vers `/app` tant que la session de A est vivante : le
     * gabarit se monte, écoule la file — sous A, et à bon droit — et le PUT
     * ainsi émis se retrouve compté au débit de B. Le premier essai a mesuré
     * exactement cela.
     */
    await ongletA.goto(`${BASE}/fr/app`, { waitUntil: 'networkidle' })
    await ongletA.click('header button:last-of-type').catch(() => {})
    await ongletA.waitForURL('**/connexion', { timeout: 20000 }).catch(() => {})
    await ongletA.waitForTimeout(800)

    await ongletA.evaluate(
      ([k, owner]) => {
        localStorage.setItem(k, JSON.stringify({
          ownerUserUuid: owner,
          version: 2,
          entries: [{
            id: '/me/attempts/019ff000-0000-7000-8000-000000000000/items/019ff000-0000-7000-8000-000000000001',
            chemin: '/me/attempts/019ff000-0000-7000-8000-000000000000/items/019ff000-0000-7000-8000-000000000001',
            corps: { option_uuid: null, confidence: 'sure', elapsed_ms: 1000, client_reported_at: new Date().toISOString() },
            pose: Date.now(), etat: 'a_reessayer', tentatives: 0,
            repere: { attemptUuid: '019ff000-0000-7000-8000-000000000000', itemUuid: '019ff000-0000-7000-8000-000000000001', position: 1 },
          }],
        }))
      },
      [CLE, uuidA],
    )

    const avant = (await lireFile(ongletA))?.entries ?? []

    const putsB = []
    ongletA.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/items/')) putsB.push(r.url())
    })

    // Session de A close : ce qui part maintenant part sous B, ou ne part pas.
    await ongletA.fill('input[type="email"]', emailB)
    await ongletA.fill('input[type="password"]', mdpB)
    await ongletA.click('button[type="submit"]')
    await ongletA.waitForURL('**/app', { timeout: 20000 })
    await ongletA.waitForTimeout(3000)

    const apres = (await lireFile(ongletA))?.entries ?? []
    const message = await ongletA.locator('[data-file-proprietaire]').isVisible().catch(() => false)

    note(
      'BLOC-4 — une autre identité n’écoule pas la file du précédent',
      putsB.length === 0 && apres.length === avant.length && avant.length > 0,
      `${avant.length} entrée(s) avant, ${apres.length} après · ${putsB.length} PUT émis sous le compte B · `
        + `message de propriétaire affiché : ${message}`,
    )
    await ongletA.screenshot({ path: `${SORTIE}-01-proprietaire.png` })
  }

  await contexte.close()
}

// ════════════════════════════════════ BLOC-5 — un refus bloque la soumission
{
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await contexte.newPage()
  await connecter(page, emailA, mdpA)

  const ouvert = await api(page, `/me/diagnostics/${codeEpreuve}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `bloc5-${Date.now()}` },
    body: { total: 5 },
  })
  const attempt = JSON.parse(ouvert.corps).data

  if (!attempt) {
    note('BLOC-5 — un refus bloque la soumission', false, `série indisponible : ${ouvert.corps.slice(0, 120)}`)
  } else {
    await page.goto(`${BASE}/fr/app/tentative/${attempt.uuid}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.option', { timeout: 15000 })

    // Deux réponses mises en file hors connexion.
    await contexte.setOffline(true)
    for (const i of [0, 1]) {
      await page.locator('.option__choix').nth(i).check()
      await page.locator('.certitude__radio').nth(i).check()
      await page.locator('.passation__actes .btn').nth(1).click()
      await page.waitForTimeout(700)
    }
    const enFile = ((await lireFile(page))?.entries ?? []).length
    await contexte.setOffline(false)

    // La PREMIÈRE réponse rejouée reçoit 422.
    let premiere = true
    await page.route('**/api/v1/me/attempts/*/items/*', (route) => {
      if (premiere) {
        premiere = false
        return route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'VALIDATION_FAILED', message: 'Réponse refusée.', request_id: 'recette' },
          }),
        })
      }
      return route.continue()
    })

    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForTimeout(3500)

    const apresEcoulement = (await lireFile(page))?.entries ?? []
    const refuses = apresEcoulement.filter((e) => e.etat === 'refuse')

    note(
      'BLOC-5 — un refus définitif reste en file',
      refuses.length === 1 && apresEcoulement.length >= 1,
      `${enFile} entrée(s) en file · après écoulement : ${apresEcoulement.length}, dont ${refuses.length} refusée(s) `
        + `(${refuses[0]?.refus?.statut ?? '—'} ${refuses[0]?.refus?.code ?? ''})`,
    )

    const boite = await page.locator('[data-file-echecs]').isVisible().catch(() => false)
    note(
      'BLOC-5 — le refus est présenté au candidat, avec l’item',
      boite,
      `boîte d'échec affichée : ${boite} · repère : ${refuses[0]?.repere?.itemUuid?.slice(0, 8) ?? '—'}…`,
    )
    await page.screenshot({ path: `${SORTIE}-02-refus.png`, fullPage: true })

    // « Terminer » ne doit émettre AUCUN POST /submit, et ne rien supprimer.
    const submits = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/submit')) submits.push(r.url())
    })

    await page.goto(`${BASE}/fr/app/tentative/${attempt.uuid}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    for (let i = 0; i < 10; i++) {
      if (await page.locator('.voile').isVisible().catch(() => false)) break
      if (!(await page.locator('.option').first().isVisible().catch(() => false))) break
      await page.locator('.option__choix').nth(i % 4).check()
      await page.locator('.certitude__radio').nth(i % 3).check()
      await page.locator('.passation__actes .btn').nth(1).click()
      await page.waitForTimeout(500)
    }
    if (await page.locator('.voile').isVisible().catch(() => false)) {
      await page.locator('.voile__actes .btn').first().click()
      await page.waitForTimeout(2500)
    }

    const finale = (await lireFile(page))?.entries ?? []
    note(
      'BLOC-5 — « terminer » n’émet aucun submit et ne supprime rien',
      submits.length === 0 && finale.filter((e) => e.etat === 'refuse').length === 1,
      `${submits.length} POST /submit émis · ${finale.filter((e) => e.etat === 'refuse').length} refus toujours en file`,
    )
  }

  await contexte.close()
}

// ══════════════════════════ SSR — aucune fuite dans le HTML authentifié
{
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await contexte.newPage()
  await connecter(page, emailA, mdpA)

  const attempts = JSON.parse((await api(page, '/me/attempts')).corps).data
  const enCours = attempts.find((a) => a.status === 'in_progress') ?? attempts[0]

  /*
   * Le contrôle de non-fuite reposait jusqu'ici sur le TYPAGE, qui ne retire
   * aucun champ à l'exécution : si le backend se mettait à servir `is_correct`
   * pendant une passation, les types deviendraient rouges à la compilation
   * suivante — mais le HTML servi le contiendrait déjà.
   *
   * On lit donc la charge utile HYDRATÉE, telle que le serveur l'écrit dans la
   * page. C'est elle que reçoit le navigateur, et elle seule qui prouve quelque
   * chose à l'exécution.
   */
  const html = await page.evaluate(async (u) => {
    const r = await fetch(u, { credentials: 'include', headers: { Accept: 'text/html' } })
    return await r.text()
  }, `${BASE}/fr/app/tentative/${enCours.uuid}`)

  const authentifie = /naja7i|Question|passation__enonce/i.test(html) && html.length > 5000
  const fuites = ['is_correct', 'rationale', '"cause"', 'explanation'].filter((m) => html.includes(m))

  note(
    'SSR — aucune correction dans le HTML authentifié d’une passation',
    authentifie && fuites.length === 0,
    `${Math.round(html.length / 1024)} ko de HTML servi sous session · `
      + (fuites.length ? `FUITES : ${fuites.join(', ')}` : 'aucun is_correct, rationale, cause ni explanation'),
  )

  await contexte.close()
}

await navigateur.close()
writeFileSync(`${SORTIE}-resultats.json`, JSON.stringify(resultats, null, 2))

const echecs = resultats.filter((r) => !r.ok)
console.log(`\n── ${resultats.length - echecs.length}/${resultats.length} cas conformes ──`)
process.exit(echecs.length ? 1 : 0)
