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

// ═══════════════════ BLOC-4 (audit t3) — une réponse EN VOL bloque aussi
/*
 * L'ASYMÉTRIE QUE LA RECETTE NE CRÉAIT PAS : le PUT échoue en réseau, le POST
 * reste disponible.
 *
 * Le verrou de soumission ne regardait que les refus DÉFINITIFS. Une entrée
 * `a_reessayer` n'y entrait pas : `ecouler()` rendait la main, `soumettre()`
 * fermait la tentative, et le rejeu suivant recevait `ATTEMPT_CLOSED`. La
 * réponse devenait définitivement refusée et la question comptait pour SAUTÉE
 * — précisément le dommage que le BLOC-5 disait interdire.
 *
 * On ne coupe donc PAS tout le réseau : on fait échouer le seul PUT.
 */
{
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await contexte.newPage()
  await connecter(page, emailA, mdpA)

  const ouvert = await api(page, `/me/diagnostics/${codeEpreuve}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `bloc4-t3-${Date.now()}` },
    body: { total: 5 },
  })
  const attempt = JSON.parse(ouvert.corps).data

  if (!attempt) {
    note('BLOC-4 — une réponse en vol bloque la soumission', false, `série indisponible : ${ouvert.corps.slice(0, 120)}`)
  } else {
    await page.goto(`${BASE}/fr/app/tentative/${attempt.uuid}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.option', { timeout: 15000 })

    /* Une réponse mise en file hors connexion. */
    await contexte.setOffline(true)
    await page.locator('.option__choix').first().check()
    await page.locator('.certitude__radio').first().check()
    await page.locator('.passation__actes .btn').nth(1).click()
    await page.waitForTimeout(700)
    await contexte.setOffline(false)

    /* LE PUT ÉCHOUE, LE POST PASSE. C'est l'asymétrie exacte du scénario. */
    let putsBloques = 0
    await page.route('**/api/v1/me/attempts/*/items/*', (route) => {
      putsBloques += 1
      return route.abort('connectionfailed')
    })

    const submits = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/submit')) submits.push(r.url())
    })

    /*
     * ON VA JUSQU'À LA DERNIÈRE QUESTION AVANT DE RENDRE.
     *
     * Première écriture : un clic sur le dernier bouton de `.passation__actes`
     * depuis la question 1 — qui est « suivante », pas « terminer ». La
     * soumission n'était jamais tentée, et le contrôle « aucun submit » passait
     * pour la mauvaise raison. Un test vert qui ne joue pas le geste ne prouve
     * rien.
     *
     * Les PUT étant coupés, chaque « suivante » met sa réponse en file : c'est
     * précisément l'état qu'on veut au moment de rendre.
     */
    await page.goto(`${BASE}/fr/app/tentative/${attempt.uuid}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('.option', { timeout: 15000 })

    for (let i = 0; i < 10; i++) {
      const suivante = page.locator('.passation__actes .btn:not(.btn--fantome)')
      const libelle = (await suivante.innerText().catch(() => '')) ?? ''

      await page.locator('.option__choix').nth(i % 4).check().catch(() => {})
      await page.locator('.certitude__radio').first().check().catch(() => {})
      await suivante.click().catch(() => {})
      await page.waitForTimeout(500)

      if (/terminer/i.test(libelle)) break
      if (await page.locator('.voile').isVisible().catch(() => false)) break
    }

    /* La confirmation : rendre fige la série, l'écran le dit avant. */
    await page.locator('.voile__actes .btn').first().click().catch(() => {})
    await page.waitForTimeout(3000)

    const enFile = ((await lireFile(page))?.entries ?? []).length

    note(
      'BLOC-4 — aucune soumission tant qu’une réponse est en vol',
      submits.length === 0 && enFile >= 1,
      `${submits.length} POST /submit émis · ${enFile} entrée(s) toujours en file · ${putsBloques} PUT coupé(s)`,
    )

    const texte = (await page.locator('main').innerText().catch(() => '')) ?? ''
    note(
      'BLOC-4 — l’écran dit que l’envoi est en cours',
      /envoi en cours/i.test(texte),
      `message affiché : ${/envoi en cours/i.test(texte) ? 'oui' : `non — « ${texte.slice(0, 100)} »`}`,
    )

    await page.screenshot({ path: `${SORTIE}-04-en-vol.png`, fullPage: true })

    /* LE RÉSEAU REVIENT : un seul PUT 2xx, puis un seul POST de soumission. */
    await page.unroute('**/api/v1/me/attempts/*/items/*')

    const puts2xx = []
    page.on('response', (r) => {
      if (r.request().method() === 'PUT' && r.url().includes('/items/') && r.status() < 300) {
        puts2xx.push(r.url())
      }
    })

    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await page.waitForTimeout(3000)

    await page.locator('.passation__actes .btn:not(.btn--fantome)').click().catch(() => {})
    await page.waitForTimeout(600)
    await page.locator('.voile__actes .btn').first().click().catch(() => {})
    await page.waitForTimeout(3000)

    const restant = ((await lireFile(page))?.entries ?? []).length

    note(
      'BLOC-4 — la file acquittée, la soumission part',
      restant === 0 && submits.length === 1,
      `file résiduelle : ${restant} · ${puts2xx.length} PUT 2xx · ${submits.length} POST /submit`,
    )
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

// ═══ BLOC-FRONT-1 (audit t4) — une entrée SANS REPÈRE bloque quand même
/*
 * LA POPULATION QUE LE CORRECTIF PRÉCÉDENT NE COUVRAIT PAS.
 *
 * `resteAAcquitter` ne reconnaissait une entrée que par `e.repere?.attemptUuid`.
 * Or la migration v1→v2 ne reconstruit pas de repère — la v1 était un tableau nu
 * de `{chemin, corps}` — et cette version a elle-même écrit des enveloppes v2
 * sans repère quand `poser()` était appelé sans troisième argument.
 *
 * Une telle entrée est INVISIBLE au verrou : le PUT échoue, `resteAAcquitter`
 * rend `[]`, la soumission part, et le rejeu suivant reçoit `ATTEMPT_CLOSED`.
 * La réponse est perdue et la question comptée SAUTÉE — exactement le dommage
 * que D-F36 promet d'empêcher, sur exactement la population qu'il vise : le
 * candidat déjà en passation au moment du déploiement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * L'ENTRÉE INJECTÉE DOIT ÊTRE LA SEULE EN FILE. Deux écritures s'y sont
 * cassées, et toutes deux étaient VERTES AVANT CORRECTION :
 *
 *   — répondre dans l'interface avec les PUT coupés posait une entrée par
 *     réponse, AVEC repère : la soumission était bien bloquée, mais par elles ;
 *   — naviguer sans toucher aux options ne suffit pas non plus, parce que
 *     « suivante » ENREGISTRE avant d'avancer — chaque clic est un PUT.
 *
 * On coupe donc le réseau au dernier moment possible : la série est répondue,
 * la navigation faite, le voile de confirmation ouvert. On injecte alors, et le
 * seul contenu de la file est ce qu'on y a mis.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Répond à toute la série par l'API, réseau intact : la file reste vide. */
async function repondreToutParApi(page, attemptUuid) {
  const detail = JSON.parse((await api(page, `/me/attempts/${attemptUuid}`)).corps).data

  for (const it of detail.items) {
    await api(page, `/me/attempts/${attemptUuid}/items/${it.item_uuid}`, {
      method: 'PUT',
      body: {
        option_uuid: it.question?.options?.[0]?.uuid ?? null,
        confidence: 'guess',
        elapsed_ms: 1200,
        client_reported_at: new Date().toISOString(),
      },
    })
  }

  return detail
}

/** Va jusqu'au voile de confirmation, réseau intact. */
async function allerAuVoile(page, attemptUuid) {
  await page.goto(`${BASE}/fr/app/tentative/${attemptUuid}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.option', { timeout: 15000 })

  for (let i = 0; i < 12; i++) {
    if (await page.locator('.voile').isVisible().catch(() => false)) break

    const principal = page.locator('.passation__actes .btn:not(.btn--fantome)')
    await principal.click().catch(() => {})
    await page.waitForTimeout(400)
  }

  return await page.locator('.voile').isVisible().catch(() => false)
}

const CHEMIN_AILLEURS = '/me/attempts/01a00000-0000-7000-8000-000000000000/items/'
  + '01a00000-0000-7000-8000-000000000001'

for (const forme of ['tableau v1', 'enveloppe v2 sans repère']) {
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await contexte.newPage()
  await connecter(page, emailA, mdpA)

  const ouvert = await api(page, `/me/diagnostics/${codeEpreuve}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `frontt4-${forme.replace(/\W/g, '')}-${Date.now()}` },
    body: { total: 5 },
  })
  const attempt = JSON.parse(ouvert.corps).data

  if (!attempt) {
    note(`BLOC-FRONT-1 — ${forme}`, false, `série indisponible : ${ouvert.corps.slice(0, 120)}`)
    await contexte.close()
    continue
  }

  const detail = await repondreToutParApi(page, attempt.uuid)
  const moi = JSON.parse((await api(page, '/me')).corps).data

  /* Le chemin canonique d'une réponse : il porte les DEUX identifiants, et il
   * est déjà l'identité stable de l'entrée. C'est de lui que le repère doit
   * être reconstruit. */
  const chemin = `/me/attempts/${attempt.uuid}/items/${detail.items[0].item_uuid}`

  const voileOuvert = await allerAuVoile(page, attempt.uuid)
  const fileAvant = ((await lireFile(page))?.entries ?? []).length

  /* MAINTENANT SEULEMENT : on injecte, et on coupe. */
  await page.evaluate(
    ([cle, f, c, ailleurs, uuid]) => {
      const corps = { option_uuid: null, confidence: 'guess', elapsed_ms: 1000 }
      const nu = chemin => ({ chemin, corps, pose: Date.now() })
      const v2 = chemin => ({
        id: chemin, chemin, corps, pose: Date.now(), etat: 'a_reessayer', tentatives: 0,
      })

      localStorage.setItem(
        cle,
        f === 'tableau v1'
          ? JSON.stringify([nu(c), nu(ailleurs)])
          : JSON.stringify({ ownerUserUuid: uuid, version: 2, entries: [v2(c), v2(ailleurs)] }),
      )
    },
    [CLE, forme, chemin, CHEMIN_AILLEURS, moi.uuid],
  )

  let putsBloques = 0
  await page.route('**/api/v1/me/attempts/*/items/*', (route) => {
    putsBloques += 1
    return route.abort('connectionfailed')
  })

  const submits = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/submit')) submits.push(r.url())
  })

  await page.locator('.voile__actes .btn').first().click().catch(() => {})
  await page.waitForTimeout(3000)

  const entrees = (await lireFile(page))?.entries ?? []
  const texte = (await page.locator('main').innerText().catch(() => '')) ?? ''

  note(
    `BLOC-FRONT-1 — une entrée sans repère bloque la soumission (${forme})`,
    voileOuvert && fileAvant === 0 && submits.length === 0
      && entrees.length >= 1 && /envoi en cours/i.test(texte),
    `voile ouvert : ${voileOuvert} · file avant injection : ${fileAvant} (doit être 0, `
      + `sans quoi on mesure autre chose) · ${submits.length} POST /submit émis · `
      + `${entrees.length} entrée(s) en file · ${putsBloques} PUT coupé(s) · `
      + `message « envoi en cours » : ${/envoi en cours/i.test(texte) ? 'oui' : 'NON'}`,
  )

  await page.screenshot({
    path: `${SORTIE}-06-sans-repere-${forme.replace(/\W/g, '-')}.png`,
    fullPage: true,
  })
  await contexte.close()
}

/*
 * ET SEULE UNE ENTRÉE D'UNE AUTRE SÉRIE : LA SOUMISSION DOIT PARTIR.
 *
 * Sans ce contrôle, la correction la plus simple passerait : bloquer sur TOUTE
 * la file. Elle rendrait les cas précédents verts et casserait le produit — un
 * candidat ne pourrait plus rendre sa série parce qu'une réponse d'une AUTRE
 * série attend le réseau. Le repère reconstruit doit être EXACT, pas présent.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX FORMES ICI AUSSI, et c'est la mutation qui l'a exigé.
 *
 * Retirer la reconstruction de la MIGRATION v1 ne rendait aucun cas rouge : une
 * entrée sans repère bloque de toute façon, par prudence. La reconstruction n'y
 * sert donc pas à bloquer — elle sert à NE PAS TROP BLOQUER. Sans elle, la
 * réponse v1 d'une autre série empêche de rendre celle-ci, et seul un cas « en
 * forme v1 » le voit.
 *
 * Une ligne qu'aucun test ne distingue est une ligne qu'on croit utile.
 * ─────────────────────────────────────────────────────────────────────────
 */
for (const forme of ['tableau v1', 'enveloppe v2 sans repère']) {
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await contexte.newPage()
  await connecter(page, emailA, mdpA)

  const ouvert = await api(page, `/me/diagnostics/${codeEpreuve}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `frontt4-ailleurs-${forme.replace(/\W/g, '')}-${Date.now()}` },
    body: { total: 5 },
  })
  const attempt = JSON.parse(ouvert.corps).data

  if (!attempt) {
    note(`BLOC-FRONT-1 — une entrée d’une AUTRE série ne bloque pas (${forme})`, false, 'série indisponible')
  }
  else {
    await repondreToutParApi(page, attempt.uuid)
    const moi = JSON.parse((await api(page, '/me')).corps).data

    const voileOuvert = await allerAuVoile(page, attempt.uuid)

    await page.evaluate(
      ([cle, f, chemin, uuid]) => {
        const corps = { option_uuid: null, confidence: 'guess', elapsed_ms: 1000 }

        localStorage.setItem(
          cle,
          f === 'tableau v1'
            ? JSON.stringify([{ chemin, corps, pose: Date.now() }])
            : JSON.stringify({
                ownerUserUuid: uuid,
                version: 2,
                entries: [{
                  id: chemin, chemin, corps, pose: Date.now(), etat: 'a_reessayer', tentatives: 0,
                }],
              }),
        )
      },
      [CLE, forme, CHEMIN_AILLEURS, moi.uuid],
    )

    /* Seul le PUT de l'entrée ÉTRANGÈRE est coupé : elle reste en file. */
    await page.route(`**${CHEMIN_AILLEURS}`, route => route.abort('connectionfailed'))

    const submits = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/submit')) submits.push(r.url())
    })

    await page.locator('.voile__actes .btn').first().click().catch(() => {})
    await page.waitForTimeout(3000)

    const restantes = (await lireFile(page))?.entries ?? []

    note(
      `BLOC-FRONT-1 — une entrée d’une AUTRE série ne bloque pas la soumission (${forme})`,
      voileOuvert && submits.length === 1 && restantes.length === 1,
      `voile ouvert : ${voileOuvert} · ${submits.length} POST /submit émis (attendu 1) · `
        + `${restantes.length} entrée(s) étrangère(s) conservée(s) — ni envoyée, ni perdue`,
    )
  }

  await contexte.close()
}

/*
 * UNE ENTRÉE IMPOSSIBLE À RATTACHER BLOQUE — la règle de prudence.
 *
 * Le repère se reconstruit depuis le chemin ; il ne reste donc introuvable que
 * si le chemin n'a pas la forme canonique — stockage corrompu, écriture d'une
 * version future, main humaine. Sans ce cas, la règle « dans le doute, bloque »
 * n'était éprouvée par rien : la reconstruction rendait toute entrée
 * rattachable, et la ligne pouvait disparaître sans qu'un test rougisse.
 *
 * L'asymétrie décide : bloquer demande de patienter, laisser passer PERD la
 * réponse et la fait compter comme sautée.
 */
{
  const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await contexte.newPage()
  await connecter(page, emailA, mdpA)

  const ouvert = await api(page, `/me/diagnostics/${codeEpreuve}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `frontt4-opaque-${Date.now()}` },
    body: { total: 5 },
  })
  const attempt = JSON.parse(ouvert.corps).data

  if (!attempt) {
    note('BLOC-FRONT-1 — une entrée irrattachable bloque par prudence', false, 'série indisponible')
  }
  else {
    await repondreToutParApi(page, attempt.uuid)
    const moi = JSON.parse((await api(page, '/me')).corps).data
    const voileOuvert = await allerAuVoile(page, attempt.uuid)

    /* Un chemin qui ne dit NI la tentative NI l'item. Rien ne permet de le
     * rattacher — et c'est précisément le cas où l'on ne parie pas. */
    const opaque = '/me/attempts/quelque-chose-dautre'

    await page.evaluate(
      ([cle, chemin, uuid]) => localStorage.setItem(cle, JSON.stringify({
        ownerUserUuid: uuid,
        version: 2,
        entries: [{
          id: chemin,
          chemin,
          corps: { option_uuid: null, confidence: 'guess', elapsed_ms: 1000 },
          pose: Date.now(),
          etat: 'a_reessayer',
          tentatives: 0,
        }],
      })),
      [CLE, opaque, moi.uuid],
    )

    await page.route(`**${opaque}`, route => route.abort('connectionfailed'))

    const submits = []
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/submit')) submits.push(r.url())
    })

    await page.locator('.voile__actes .btn').first().click().catch(() => {})
    await page.waitForTimeout(3000)

    const restantes = (await lireFile(page))?.entries ?? []

    note(
      'BLOC-FRONT-1 — une entrée irrattachable bloque par prudence',
      voileOuvert && submits.length === 0 && restantes.length === 1,
      `voile ouvert : ${voileOuvert} · ${submits.length} POST /submit émis (attendu 0) · `
        + `${restantes.length} entrée(s) conservée(s) — jamais invisible`,
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
