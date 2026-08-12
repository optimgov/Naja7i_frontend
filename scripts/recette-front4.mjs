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

// ══════════════════════════════════════════ PARTIE 2 — E8, miroir, E1
if (partie === '2' || partie === 'toutes') {
  // ─────────────────────────────────────── aucun plafond silencieux
  {
    await page.goto(`${BASE}/fr/app/revisions`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const due = JSON.parse((await api(`/me/memory/${codeEpreuve}/due`)).corps)
    // `.enveloppe` est aussi la barre du gabarit : on vise le contenu.
    const texte = (await page.locator('main .enveloppe').innerText()) ?? ''

    const servisAffiches = texte.includes(String(due.meta.served))
    const attenteAffichee = due.meta.pending === 0 || texte.includes(String(due.meta.pending))
    const lignes = await page.locator('.rdv__ligne').count()

    note(
      'aucun plafond silencieux',
      servisAffiches && attenteAffichee && lignes === due.meta.served,
      `${due.meta.due_total} échus · ${due.meta.served} servis (${lignes} lignes rendues) · `
        + `${due.meta.pending} en attente, annoncés : ${attenteAffichee}`,
    )
    await page.screenshot({ path: `${SORTIE}-05-revisions.png`, fullPage: true })
  }

  // ─────────────────────────── la séance s'ouvre et devient une passation
  await (async () => {
    await page.locator('button.btn--grand').click()

    /*
     * Deux issues LÉGITIMES, et il faut les distinguer :
     *
     *  - la séance s'ouvre, et c'est une passation ordinaire ;
     *  - le serveur refuse — rien d'échu, ou aucune question sœur en banque —
     *    et l'écran l'annonce sans naviguer.
     *
     * Exiger la navigation ferait échouer la recette sur un comportement
     * correct : celui d'un candidat à jour, qui est le cas le plus fréquent
     * une fois la boucle installée.
     */
    const ouverte = await page
      .waitForURL('**/app/tentative/**', { timeout: 20000 })
      .then(() => true)
      .catch(() => false)

    if (ouverte) {
      const chrono = await page.locator('.passation__temps').count()
      const uuidSeance = page.url().split('/app/tentative/')[1].split(/[?#]/)[0]
      const seance = JSON.parse((await api(`/me/attempts/${uuidSeance}`)).corps).data

      note(
        'la séance de révision est une passation ordinaire',
        seance.kind !== 'diagnostic' && chrono === 0,
        `kind = ${seance.kind} · ${seance.item_count} question(s) · chronomètre rendu : ${chrono}`,
      )
    } else {
      let message = (await page.locator('.alerte').first().innerText().catch(() => '')) ?? ''

      /*
       * Un 429 n'est PAS un résultat : c'est la recette qui a martelé la route
       * (`throttle:10,1`). Le laisser passer pour vert validerait un test qui ne
       * prouve rien — le défaut qu'on reproche aux recettes complaisantes. On
       * attend la fenêtre et on réessaie une fois.
       */
      if (/trop de requêtes|too many/i.test(message)) {
        console.log('        (429 — attente de la fenêtre de limitation, puis reprise)')
        await page.waitForTimeout(62000)
        await page.reload({ waitUntil: 'networkidle' })
        await page.locator('button.btn--grand').click().catch(() => {})
        const repartie = await page
          .waitForURL('**/app/tentative/**', { timeout: 20000 })
          .then(() => true)
          .catch(() => false)

        if (repartie) {
          const uuidSeance = page.url().split('/app/tentative/')[1].split(/[?#]/)[0]
          const seance = JSON.parse((await api(`/me/attempts/${uuidSeance}`)).corps).data
          const chrono = await page.locator('.passation__temps').count()
          note(
            'la séance de révision est une passation ordinaire',
            seance.kind !== 'diagnostic' && chrono === 0,
            `kind = ${seance.kind} · ${seance.item_count} question(s) · chronomètre rendu : ${chrono}`,
          )
          await page.screenshot({ path: `${SORTIE}-06-seance.png` })
          return
        }

        message = (await page.locator('.alerte').first().innerText().catch(() => '')) ?? ''
      }

      const refusAttendu = /à jour|rien à réviser|banque|question/i.test(message)
      note(
        'la séance de révision est une passation ordinaire',
        refusAttendu,
        refusAttendu
          ? `refus annoncé sans navigation : « ${message.replace(/\n/g, ' ').slice(0, 90)} »`
          : `ni ouverture ni refus reconnaissable : « ${message.replace(/\n/g, ' ').slice(0, 90)} »`,
      )
    }

    await page.screenshot({ path: `${SORTIE}-06-seance.png` })
  })()

  // ─────────────────────────────────── rien d'échu : liste vide + date
  {
    // On repousse tous les rendez-vous : l'écran doit annoncer une date, pas
    // afficher un vide.
    await page.goto(`${BASE}/fr/app/revisions?epreuve=CRMEF-SE-2025`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)

    const due = JSON.parse((await api('/me/memory/CRMEF-SE-2025/due')).corps)
    const bloc = await page.locator('.rien').isVisible().catch(() => false)
    const texte = (await page.locator('.rien').innerText().catch(() => '')) ?? ''
    const annonce = due.meta.next_due_on
      ? /\d/.test(texte)
      : texte.length > 0

    note(
      "rien d'échu n'est pas un écran mort",
      due.meta.due_total > 0 || (bloc && annonce),
      due.meta.due_total > 0
        ? `${due.meta.due_total} échus sur cette épreuve — cas non applicable ici`
        : `bloc affiché : ${bloc} · prochaine échéance : ${due.meta.next_due_on ?? 'aucune'} · « ${texte.replace(/\n/g, ' ').slice(0, 80)} »`,
    )
    await page.screenshot({ path: `${SORTIE}-07-rien-echu.png` })
  }

  // ───────────────────────────────── le miroir n'apparaît que s'il existe
  let itemAvecMiroir = null
  {
    const attempts = JSON.parse((await api('/me/attempts')).corps).data
    const soumise = attempts.find((a) => a.status !== 'in_progress')
    const corr = JSON.parse((await api(`/me/attempts/${soumise.uuid}/correction`)).corps)

    const avec = corr.data.filter((l) => l.mirror_available)
    const sans = corr.data.filter((l) => !l.mirror_available)
    itemAvecMiroir = avec[0]?.item_uuid ?? null

    await page.goto(`${BASE}/fr/app/tentative/${soumise.uuid}/correction`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const boutons = await page.locator('.miroir__action').count()
    const desactives = await page.locator('.miroir__action[disabled]').count()

    note(
      'le miroir n’apparaît que si mirror_available',
      boutons === avec.length && desactives === 0,
      `${avec.length} item(s) avec sœur → ${boutons} bouton(s) · ${sans.length} sans → aucun rendu · `
        + `boutons désactivés : ${desactives}`,
    )
    await page.screenshot({ path: `${SORTIE}-08-miroir.png`, fullPage: true })
  }

  // ──────────────────── le miroir ne consomme pas de quota déjà payé
  if (itemAvecMiroir) {
    const avant = JSON.parse((await api('/me/attempts')).corps)
    const attempts = avant.data
    const soumise = attempts.find((a) => a.status !== 'in_progress')
    const quotaAvant = JSON.parse((await api(`/me/attempts/${soumise.uuid}/correction`)).corps).meta.cause_quota

    const r = await api(`/me/mirrors/${itemAvecMiroir}`, {
      method: 'POST', headers: { 'Idempotency-Key': `miroir-recette-${Date.now()}` },
    })
    const j = JSON.parse(r.corps)

    const quotaApres = JSON.parse((await api(`/me/attempts/${soumise.uuid}/correction`)).corps).meta.cause_quota

    /*
     * Un 409 MIRROR_ALREADY_OPEN est un succès pour CE contrôle : le serveur
     * refuse d'en ouvrir un second, et rien n'a été décompté. Ce qui est
     * vérifié ici est le quota, pas l'ouverture.
     */
    const accepte = r.statut < 400 || j.error?.code === 'MIRROR_ALREADY_OPEN'

    note(
      'le miroir ne coûte pas de quota déjà payé',
      accepte && quotaApres.revealed === quotaAvant.revealed,
      `${r.statut}${j.error ? ' ' + j.error.code : ''} · cause servie : ${j.meta?.cause ?? '—'} · `
        + `quota révélé ${quotaAvant.revealed} → ${quotaApres.revealed} (plafond ${quotaApres.quota})`,
    )
  }

  // ────────────────────────────────── le tableau de bord compte les échus
  {
    await page.goto(`${BASE}/fr/app`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)

    const due = JSON.parse((await api(`/me/memory/${codeEpreuve}/due`)).corps)
    const texte = (await page.locator('.revisions').innerText().catch(() => '')) ?? ''
    const montre = due.meta.due_total === 0
      ? texte.length > 0
      : texte.includes(String(due.meta.due_total))

    note(
      'le tableau de bord compte les rendez-vous échus',
      montre,
      `${due.meta.due_total} échus · bloc : « ${texte.replace(/\n/g, ' ').slice(0, 70)} »`,
    )
    await page.screenshot({ path: `${SORTIE}-09-tableau-de-bord.png`, fullPage: true })
  }

  // ────────────────────────────────────────── bascule arabe sur E8
  {
    await page.goto(`${BASE}/ar/app/revisions`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const dir = await page.evaluate(() => document.documentElement.dir)
    const lang = await page.evaluate(() => document.documentElement.lang)
    const sansDir = await page.evaluate(
      () => [...document.querySelectorAll('.rdv__domaine')].filter((e) => e.getAttribute('dir') !== 'auto').length,
    )
    const avecDir = await page.evaluate(
      () => document.querySelectorAll('.rdv__domaine[dir="auto"]').length,
    )
    note(
      'bascule arabe sur E8',
      dir === 'rtl' && lang === 'ar' && sansDir === 0,
      `dir=${dir}, lang=${lang} · ${avecDir} libellé(s) d’API avec dir="auto", ${sansDir} sans`,
    )
    await page.screenshot({ path: `${SORTIE}-10-e8-arabe.png`, fullPage: true })
  }
}

await navigateur.close()
writeFileSync(`${SORTIE}-resultats.json`, JSON.stringify(resultats, null, 2))

const echecs = resultats.filter((r) => !r.ok)
console.log(`\n── ${resultats.length - echecs.length}/${resultats.length} cas conformes ──`)
process.exit(echecs.length ? 1 : 0)
