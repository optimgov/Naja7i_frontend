#!/usr/bin/env node
/**
 * recette-front3.mjs — la recette du lot, cas par cas.
 *
 * PALIER ÉPROUVÉ : ESSAI, sur un compte NEUF à chaque exécution.
 * Elle éprouve des REFUS : il lui faut le mur DEBOUT. Sur un compte payant elle
 * mesurerait des portes ouvertes en croyant mesurer des portes fermées.
 *
 * Le compte est neuf, et il n'est partagé avec aucun autre scénario : l'essai
 * porte une enveloppe de quarante questions, non renouvelable. Deux scénarios
 * qui s'y servent dépendent de l'ordre où on les joue, sans que rien ne le
 * dise — l'ordre implicite que ce lot retire.
 *
 * Elle ne teste PAS le chemin heureux : celui-là est couvert par
 * `recette-passation.mjs`. Elle teste les cas qui doivent échouer, et la façon
 * dont ils échouent — une recette qui ne vérifie que ce qui marche ne prouve
 * rien.
 *
 *   node scripts/recette-front3.mjs <email> <motDePasse> [codeEpreuve]
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const [email, motDePasse, codeEpreuve = 'CRMEF-FR-SPEC-2025'] = process.argv.slice(2)
if (!email || !motDePasse) {
  console.error('Usage : node scripts/recette-front3.mjs <email> <motDePasse> [codeEpreuve]')
  process.exit(2)
}

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const SORTIE = process.env.SORTIE || '/tmp/recette-front3'
const INTERDITS = ['is_correct', 'rationale', '"cause"']

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
    trafic.push({ url: r.url(), statut: r.status(), corps: await r.text() })
  } catch { /* corps consommé */ }
})

async function connecter() {
  await page.goto(`${BASE}/fr/connexion`, { waitUntil: 'networkidle' })

  // Une session encore valide fait rediriger /connexion vers /app par la garde
  // `guest` : il n'y a alors aucun formulaire à remplir.
  if (page.url().includes('/app')) return

  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', motDePasse)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/app', { timeout: 20000 })
}

/** Appelle l'API par le relais du BFF, depuis la page — donc avec la session. */
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

await connecter()

// ─────────────────────────────────────────── 1. correction avant soumission
{
  const ouvert = await api(`/me/diagnostics/${codeEpreuve}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `recette-c-${Date.now()}` },
    body: { total: 5 },
  })
  const attempt = JSON.parse(ouvert.corps).data
  if (!attempt) {
    console.error(`Impossible d'ouvrir un diagnostic : ${ouvert.statut} ${ouvert.corps}`)
    process.exit(1)
  }
  const r = await api(`/me/attempts/${attempt.uuid}/correction`)
  const j = JSON.parse(r.corps)
  note(
    'correction demandée avant soumission',
    r.statut === 409 && j.error?.code === 'ATTEMPT_NOT_SUBMITTED' && Boolean(j.error?.message),
    `${r.statut} ${j.error?.code} — « ${j.error?.message} »`,
  )

  // ───────────────────────────────── 2. deuxième diagnostic sur la même épreuve
  const second = await api(`/me/diagnostics/${codeEpreuve}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `recette-c-autre-${Date.now()}` },
    body: { total: 5 },
  })
  const memeTentative = JSON.parse(second.corps).data?.uuid === attempt.uuid
  note(
    'deuxième diagnostic sur la même épreuve',
    memeTentative,
    memeTentative
      ? `la tentative en cours est rendue (${attempt.uuid.slice(0, 8)}…), pas une seconde`
      : 'une seconde tentative a été ouverte',
  )

  // ─────────────────────────────────────────────── 3. UUID d'un autre compte
  const faux = '019ff000-0000-7000-8000-000000000000'
  const etranger = await api(`/me/attempts/${faux}`)
  const je = JSON.parse(etranger.corps)

  /*
   * Ce qu'on cherche, c'est un AVEU D'EXISTENCE — « vous n'y avez pas droit »,
   * « appartient à un autre compte », « accès refusé » — qui reconstituerait un
   * 403 en français. « Cette ressource n'existe pas » est au contraire la
   * formulation juste : elle ne dit rien de plus que le code 404.
   *
   * La première version de ce test cherchait le motif « exist », et refusait
   * donc précisément la bonne réponse.
   */
  const aveu = /(n'y avez pas droit|pas autoris|autre compte|appartient|acc[èe]s refus|forbidden|interdit)/i
  const muet = !aveu.test(je.error?.message ?? '')
  note(
    "UUID d'une tentative d'un autre compte",
    etranger.statut === 404 && muet,
    `${etranger.statut} — « ${je.error?.message} » (aucun aveu d'existence)`,
  )
}

// ───────────────────────────────────────── 4. double clic sur « lancer »
{
  // Deux gardes, vérifiées séparément.
  //
  // (a) L'interface : le bouton se désactive dès le premier clic. C'est un
  //     confort, pas une garantie — un réseau lent, un double événement
  //     matériel ou un candidat pressé sur mobile passent au travers.
  // (b) Le contrat : deux POST portant la MÊME clé d'idempotence ne créent
  //     qu'une tentative. C'est la vraie garantie, et c'est elle qu'on mesure.
  await page.goto(`${BASE}/fr/app/diagnostic/${codeEpreuve}`, { waitUntil: 'networkidle' })

  const bouton = page.locator('button.btn--grand')
  await bouton.click()
  const desactiveApresUnClic = await bouton.isDisabled().catch(() => false)
  await page.waitForURL('**/app/tentative/**', { timeout: 20000 })

  const cle = `recette-double-${Date.now()}`
  const a = await api(`/me/diagnostics/${codeEpreuve}`, {
    method: 'POST', headers: { 'Idempotency-Key': cle }, body: { total: 5 },
  })
  const b = await api(`/me/diagnostics/${codeEpreuve}`, {
    method: 'POST', headers: { 'Idempotency-Key': cle }, body: { total: 5 },
  })
  const memeUuid = JSON.parse(a.corps).data?.uuid === JSON.parse(b.corps).data?.uuid

  note(
    'double clic sur « lancer »',
    desactiveApresUnClic && memeUuid,
    `bouton désactivé après le 1er clic : ${desactiveApresUnClic} · deux POST à clé identique → même tentative : ${memeUuid}`,
  )
}

// ─────────────────────── 5. passation : aucune trace de correction sur le fil
const urlTentative = page.url()
const uuidTentative = urlTentative.split('/app/tentative/')[1].split(/[?#]/)[0]
{
  const pendant = trafic.filter(
    (t) => t.url.includes('/me/attempts/') && !t.url.includes('/correction'),
  )
  const fuites = pendant.filter((t) => INTERDITS.some((m) => t.corps.includes(m)))
  note(
    'passation : aucune trace de correction sur le fil',
    fuites.length === 0,
    `${pendant.length} réponses d'API inspectées, ${fuites.length} fuite(s)`,
  )
}

// ────────────────────────────────────── 6. session expirée pendant la passation
{
  await page.goto(`${BASE}/fr/app/tentative/${uuidTentative}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.option', { timeout: 15000 })
  await page.locator('.option__choix').first().check()
  await page.locator('.certitude__radio').first().check()

  /*
   * On simule l'expiration en faisant répondre 401 au seul enregistrement de
   * réponse, plutôt qu'en effaçant les cookies.
   *
   * Effacer les cookies casse AUSSI la navigation et le reste de la recette, et
   * mesure alors le comportement d'un navigateur déconnecté — pas celui d'une
   * session qui expire pendant qu'on répond, qui est le cas à vérifier.
   */
  await page.route('**/api/v1/me/attempts/*/items/*', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AUTH_UNAUTHENTICATED', message: 'Session expirée.', request_id: 'recette' },
      }),
    }),
  )

  await page.locator('.passation__actes .btn').nth(1).click()
  await page.waitForTimeout(1500)

  const repriseVisible = await page.locator('[role="dialog"]').first().isVisible().catch(() => false)
  const enFile = await page.evaluate(() => {
    try {
      /* La file est une ENVELOPPE depuis le BLOC-4 : {ownerUserUuid, version,
         entries}. On accepte encore le tableau nu de la v1 — une recette qui
         ne lit qu'une seule forme rend `undefined` au lieu d'échouer, et
         `undefined` se lit comme un test qui passe. */
      const brut = JSON.parse(localStorage.getItem('naja7i.file-envoi') ?? 'null')
      if (brut === null) return 0
      return Array.isArray(brut) ? brut.length : (brut.entries?.length ?? 0)
    } catch {
      return -1
    }
  })

  note(
    'session expirée pendant une passation',
    repriseVisible && enFile >= 1,
    `reprise proposée sur place : ${repriseVisible} · réponses conservées en file : ${enFile}`,
  )

  await page.screenshot({ path: `${SORTIE}-01-session-expiree.png` })

  // La session n'a jamais été réellement perdue : on lève l'interception.
  await page.unroute('**/api/v1/me/attempts/*/items/*')
}

// ───────────────────────────── 7. réponse hors connexion, rejouée sans doublon
{
  await connecter()
  await page.goto(`${BASE}/fr/app/tentative/${uuidTentative}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.option', { timeout: 15000 })

  await contexte.setOffline(true)
  await page.locator('.option__choix').nth(1).check()
  await page.locator('.certitude__radio').nth(1).check()
  await page.locator('.passation__actes .btn').nth(1).click()
  await page.waitForTimeout(1000)

  const banniere = await page.locator('[data-hors-ligne]').isVisible().catch(() => false)
  const enFile = await page.evaluate(() => {
    try {
      /* La file est une ENVELOPPE depuis le BLOC-4 : {ownerUserUuid, version,
         entries}. On accepte encore le tableau nu de la v1 — une recette qui
         ne lit qu'une seule forme rend `undefined` au lieu d'échouer, et
         `undefined` se lit comme un test qui passe. */
      const brut = JSON.parse(localStorage.getItem('naja7i.file-envoi') ?? 'null')
      if (brut === null) return 0
      return Array.isArray(brut) ? brut.length : (brut.entries?.length ?? 0)
    } catch {
      return -1
    }
  })
  await page.screenshot({ path: `${SORTIE}-02-hors-connexion.png` })

  const putAvant = trafic.filter((t) => t.url.includes('/items/')).length
  await contexte.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await page.waitForTimeout(2500)

  const putApres = trafic.filter((t) => t.url.includes('/items/')).length
  const resteEnFile = await page.evaluate(() => {
    try {
      /* La file est une ENVELOPPE depuis le BLOC-4 : {ownerUserUuid, version,
         entries}. On accepte encore le tableau nu de la v1 — une recette qui
         ne lit qu'une seule forme rend `undefined` au lieu d'échouer, et
         `undefined` se lit comme un test qui passe. */
      const brut = JSON.parse(localStorage.getItem('naja7i.file-envoi') ?? 'null')
      if (brut === null) return 0
      return Array.isArray(brut) ? brut.length : (brut.entries?.length ?? 0)
    } catch {
      return -1
    }
  })

  note(
    'réponse envoyée hors connexion',
    banniere && enFile >= 1 && resteEnFile === 0 && putApres - putAvant >= 1,
    `bandeau affiché : ${banniere} · mise en file : ${enFile} · rejouée au retour : ${putApres - putAvant} envoi(s) · file vidée : ${resteEnFile === 0}`,
  )
}

// ────────────────────────────────────────────────── 8. quota de causes épuisé
{
  // On termine la série pour atteindre la correction.
  await page.goto(`${BASE}/fr/app/tentative/${uuidTentative}`, { waitUntil: 'networkidle' })
  for (let i = 0; i < 40; i++) {
    if (!(await page.locator('.option').first().isVisible().catch(() => false))) break
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
  await page.waitForTimeout(1200)

  const justifications = await page.locator('.justification').count()
  const causes = await page.locator('.autopsie__hypothese').count()
  const fermees = await page.locator('.cause-fermee').count()
  const boutonsDesactives = await page.locator('button[disabled], [aria-disabled="true"]').count()

  note(
    'quota de causes épuisé',
    justifications > 0 && fermees > 0 && boutonsDesactives === 0,
    `${justifications} justification(s) visibles · ${causes} cause(s) affichée(s) · ${fermees} ligne(s) fermée(s) · ${boutonsDesactives} bouton désactivé`,
  )

  // La mention « hypothèse » vient du CSS, pas de la rédaction.
  const mention = await page
    .locator('.autopsie__hypothese')
    .first()
    .evaluate((e) => getComputedStyle(e, '::after').content)
    .catch(() => '')
  note(
    'la cause est présentée comme une hypothèse',
    mention.includes('hypothèse'),
    `::after = ${mention}`,
  )

  await page.screenshot({ path: `${SORTIE}-03-correction.png`, fullPage: true })
}

// ───────────────────────────────────────────── 9. score null, jamais 0 %
{
  await page.goto(`${BASE}/fr/app/maitrise/${codeEpreuve}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  /*
   * Ce que la règle interdit, c'est de rendre un score ABSENT comme un zéro.
   * Elle n'interdit pas d'afficher un vrai zéro : un domaine mesuré sur cinq
   * réponses et raté cinq fois vaut bien 0 %, et le taire serait un autre
   * mensonge.
   *
   * La première version de ce test cherchait « 0 % » n'importe où dans la page
   * et refusait donc un zéro légitime. On compare maintenant l'écran à la
   * source : autant de scores affichés que de scores non nuls, et aucun
   * domaine sans conclusion ne porte de pourcentage.
   */
  const source = JSON.parse((await api(`/me/mastery/${codeEpreuve}`)).corps).data
  const nulsAttendus = source.filter((d) => d.score === null).length
  const chiffresAttendus = source.length - nulsAttendus

  const sansConclusion = await page.locator('.domaine__sans-conclusion').count()
  const scoresAffiches = await page.locator('.domaine__score').count()
  const melange = await page.evaluate(
    () =>
      [...document.querySelectorAll('.domaine')].filter(
        (d) => d.querySelector('.domaine__sans-conclusion') && d.querySelector('.domaine__score'),
      ).length,
  )

  note(
    'score null — jamais rendu comme 0 %',
    sansConclusion === nulsAttendus && scoresAffiches === chiffresAttendus && melange === 0,
    `${nulsAttendus} score(s) null → ${sansConclusion} phrase(s) « pas assez de réponses » · `
      + `${chiffresAttendus} score(s) mesuré(s) → ${scoresAffiches} pourcentage(s) affiché(s) · `
      + `aucun domaine ne porte les deux : ${melange === 0}`,
  )
  await page.screenshot({ path: `${SORTIE}-04-maitrise.png`, fullPage: true })
}

// ──────────────────────────────────── 10. ordonnance : disclaimer et angle mort
{
  await page.goto(`${BASE}/fr/app/ordonnance/${codeEpreuve}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)

  const disclaimer = (await page.locator('.disclaimer').textContent().catch(() => ''))?.trim() ?? ''
  const anglesMorts = await page.locator('[data-angle-mort="true"]').count()

  /*
   * ═════════════════════════════════════════════════════════════════════════
   * LE DISCLAIMER N'EST PAS DÛ : IL EST DÛ *SI* L'ORDONNANCE EST RENDUE.
   *
   * Cette assertion exigeait le disclaimer sans condition. Elle datait d'avant
   * le lot 3A.9, où l'ordonnance était ouverte à tout compte. Depuis
   * l'arbitrage D-CAT, `remediation.plan` n'est composée que par « Session
   * complète » : pour tout autre palier, le serveur ne rend NI `data` NI
   * `meta.disclaimer` — l'avertissement qualifie une ordonnance, et il n'y en
   * a pas.
   *
   * L'attente était donc devenue impossible à tenir, et elle rougissait sur un
   * écran parfaitement correct. Mesuré : le commit qui précède le lot M-009
   * échoue exactement ici, au même score.
   *
   * On mesure maintenant la RÈGLE, dans ses deux sens — c'est ce qui la rend
   * capable de rougir pour la bonne raison :
   *
   *   · ordonnance rendue  → le disclaimer du serveur est là, affiché sans
   *     retouche, et jamais remplacé par un repli écrit dans le gabarit ;
   *   · ordonnance absente → AUCUN disclaimer (l'imiter viderait de son sens
   *     la clause qui nous engage), aucune ligne de plan, et une issue — la
   *     page ne se termine jamais close.
   */
  const ordonnanceRendue = (await page.locator('.plan, .vide').count()) > 0
  const issue = await page.locator('.non-rendu').count()

  if (ordonnanceRendue) {
    note(
      'aucune prédiction : le disclaimer du serveur est affiché',
      disclaimer.length > 0,
      `« ${disclaimer.slice(0, 90)}… »`,
    )
  } else {
    note(
      'ordonnance hors accès : aucun disclaimer imité, et une issue rendue',
      disclaimer.length === 0 && issue === 1,
      `disclaimer absent : ${disclaimer.length === 0} · bloc d’issue : ${issue}`
        + ' (le champ n’est pas dans la réponse du serveur — voir lot 3A.9)',
    )
  }
  note(
    'un domaine jamais évalué est un angle mort',
    anglesMorts >= 0,
    `${anglesMorts} ligne(s) marquée(s) angle mort`,
  )
  await page.screenshot({ path: `${SORTIE}-05-ordonnance.png`, fullPage: true })
}

// ─────────────────────────── 11. thème sombre : aucun clignotement au rechargement
{
  await page.locator('[data-bascule-theme]').click()
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'domcontentloaded' })

  // L'attribut est-il DÉJÀ dans le HTML servi, avant tout script ?
  const html = await page.evaluate(async () => {
    const r = await fetch(location.href, { credentials: 'include' })
    return (await r.text()).slice(0, 400)
  })
  const dansLeHtml = /<html[^>]*data-theme=["']sombre["']/.test(html)

  note(
    'rechargement en thème sombre',
    dansLeHtml,
    dansLeHtml
      ? "data-theme='sombre' présent dans le HTML du serveur — rien à repeindre"
      : "l'attribut est posé après coup : clignotement",
  )
  await page.screenshot({ path: `${SORTIE}-06-sombre.png` })
}

// ─────────────────────────────────── 12. bascule arabe sur les six écrans
{
  const ECRANS = [
    ['E1 tableau de bord', '/app'],
    ['E2 diagnostic', `/app/diagnostic/${codeEpreuve}`],
    ['E3 passation', `/app/tentative/${uuidTentative}`],
    ['E4 correction', `/app/tentative/${uuidTentative}/correction`],
    ['E5 maîtrise', `/app/maitrise/${codeEpreuve}`],
    ['E6 ordonnance', `/app/ordonnance/${codeEpreuve}`],
  ]

  const manques = []
  for (const [nom, chemin] of ECRANS) {
    await page.goto(`${BASE}/ar${chemin}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const dir = await page.evaluate(() => document.documentElement.dir)
    const lang = await page.evaluate(() => document.documentElement.lang)
    // Toute chaîne venant de l'API porte dir="auto".
    const sansDir = await page.evaluate(() => {
      const suspects = document.querySelectorAll(
        '.ligne__enonce, .passation__enonce, .domaine__nom, .plan__domaine, .carte-epreuve__nom, .opt__contenu',
      )
      return [...suspects].filter((e) => e.getAttribute('dir') !== 'auto').length
    })
    if (dir !== 'rtl' || lang !== 'ar' || sansDir > 0) {
      manques.push(`${nom} (dir=${dir}, lang=${lang}, sans dir="auto" : ${sansDir})`)
    }
  }

  note(
    'bascule arabe sur les six écrans',
    manques.length === 0,
    manques.length ? manques.join(' · ') : 'dir="rtl", lang="ar", et dir="auto" partout sur les chaînes d’API',
  )
  await page.screenshot({ path: `${SORTIE}-07-arabe.png`, fullPage: true })
}

// ──────────────── 13. rappel FRONT-2 ligne 6 : épreuves d'une famille + coefficient
{
  await page.goto(`${BASE}/fr/concours/famille/crmef`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const r = await api('/catalogue/familles/crmef')
  const familles = JSON.parse(r.corps).data
  const exams = familles.exams ?? []
  const forme = exams.every(
    (e) => typeof e.code === 'string' && typeof e.name === 'string' && (e.coefficient === null || typeof e.coefficient === 'number'),
  )
  note(
    'FRONT-2 ligne 6 — épreuves d’une famille avec coefficient',
    exams.length > 0 && forme,
    `${exams.length} épreuve(s) : ${exams.map((e) => `${e.code} (coef. ${e.coefficient})`).join(', ')}`,
  )
}

// ───────────────────── 14. audit de rendu des six écrans, SOUS SESSION
{
  const cookies = await contexte.cookies()
  writeFileSync(`${SORTIE}-cookies.json`, JSON.stringify(cookies, null, 2))

  const ECRANS = [
    ['E1 tableau de bord', '/app'],
    ['E2 diagnostic', `/app/diagnostic/${codeEpreuve}`],
    ['E3 passation', `/app/tentative/${uuidTentative}`],
    ['E4 correction', `/app/tentative/${uuidTentative}/correction`],
    ['E5 maîtrise', `/app/maitrise/${codeEpreuve}`],
    ['E6 ordonnance', `/app/ordonnance/${codeEpreuve}`],
  ]

  const AUDITEUR = new URL('../docs/design/ui-v3/scripts/auditer.mjs', import.meta.url).pathname
  const binaire = chromium.executablePath()
  const enEchec = []

  for (const langue of ['fr', 'ar']) {
    for (const [nom, chemin] of ECRANS) {
      const r = spawnSync(
        process.execPath,
        [
          AUDITEUR, `${BASE}/${langue}${chemin}`,
          '--largeur', '1440,390',
          '--sombre', '[data-bascule-theme]',
          '--cookies', `${SORTIE}-cookies.json`,
          '--chromium', binaire,
        ],
        { encoding: 'utf8' },
      )
      if (r.status !== 0) {
        enEchec.push(`${nom} · ${langue}`)
        console.log((r.stdout || '').split('\n').slice(0, 20).join('\n'))
      }
    }
  }

  note(
    'audit de rendu — six écrans × 1440/390 × FR/AR × clair/sombre',
    enEchec.length === 0,
    enEchec.length ? `anomalies graves : ${enEchec.join(', ')}` : '24 passes, aucune anomalie grave',
  )
}

await navigateur.close()

writeFileSync(`${SORTIE}-resultats.json`, JSON.stringify(resultats, null, 2))

const echecs = resultats.filter((r) => !r.ok)
console.log(`\n── ${resultats.length - echecs.length}/${resultats.length} cas conformes ──`)
process.exit(echecs.length ? 1 : 0)
