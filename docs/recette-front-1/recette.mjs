import { chromium } from 'playwright'

const FRONT = 'http://localhost:3000'
const MAILPIT = 'http://localhost:8025'
const SHOTS = '/private/tmp/claude-504/-Users-Redouan-Coding-Naja7i-frontend/d0bf7739-ea35-4967-8302-cc011f680ce8/scratchpad/shots'

const stamp = Date.now()
const EMAIL_FR = `recette.fr.${stamp}@naja7i.test`
const EMAIL_AR = `recette.ar.${stamp}@naja7i.test`
const PWD = 'phrase-de-passe-solide-2026'
const PWD2 = 'nouvelle-phrase-de-passe-2026'

const results = []
const directApiCalls = []
const apiLog = []

function dernieresReponses(n = 4) {
  return apiLog.slice(-n).map(r => `${r.status} ${r.path}`).join(' | ') || 'aucune'
}

// `auth/register` est plafonné à 6 requêtes/minute par IP (throttle:6,1).
// La recette en enchaîne quatre : sans pause, l'automatisation déclenche
// elle-même le plafond et produit un faux échec.
async function respirer(page, secondes) {
  console.log(`      (pause de ${secondes}s — plafond de 6 inscriptions/minute)`)
  await page.waitForTimeout(secondes * 1000)
}

function record(n, label, ok, detail) {
  results.push({ n, label, ok, detail })
  console.log(`\n[${n}] ${ok ? 'OK  ' : 'ECHEC'} — ${label}\n      ${detail}`)
}

async function mailpitClear() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
}

async function mailpitLatest(to) {
  for (let i = 0; i < 40; i++) {
    const r = await fetch(`${MAILPIT}/api/v1/messages?limit=50`).then(r => r.json())
    const m = (r.messages ?? []).find(m => (m.To ?? []).some(t => t.Address === to))
    if (m) {
      const full = await fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then(r => r.json())
      return full
    }
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}

function firstLink(msg, pattern) {
  const body = `${msg.HTML ?? ''}\n${msg.Text ?? ''}`
  const links = [...body.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map(m => m[1] ?? m[0])
  const hit = links.find(l => pattern.test(l))
  return hit ? hit.replace(/&amp;/g, '&') : null
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })

// Point de vigilance : le navigateur ne doit JAMAIS joindre l'API directement.
context.on('request', req => {
  const u = req.url()
  if (u.includes('localhost:8000') || u.includes('127.0.0.1:8000')) directApiCalls.push(u)
})

const page = await context.newPage()

page.on('response', async r => {
  const u = r.url()
  if (u.includes('/api/v1/') || u.includes('/sanctum/')) {
    let body = ''
    try { body = (await r.text()).slice(0, 300) } catch {}
    apiLog.push({ status: r.status(), path: u.replace(FRONT, ''), body })
  }
})
const shot = n => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true })

async function fill(sel, val) {
  await page.locator(sel).fill(val)
}

async function inscrire(locale, email, opts = {}) {
  await page.goto(`${FRONT}/${locale}/inscription`, { waitUntil: 'networkidle' })
  await fill('input[type=email]', email)
  const pw = page.locator('input[type=password]')
  await pw.nth(0).fill(opts.password ?? PWD)
  await pw.nth(1).fill(opts.password ?? PWD)
  const cases = page.locator('fieldset.actes input[type=checkbox]')
  if (!opts.skipCgu) await cases.nth(0).check()
  await cases.nth(1).check()
  await page.locator('button[type=submit]').click()
}

try {
  await mailpitClear()

  // ---------------------------------------------------------------- 1
  await inscrire('fr', EMAIL_FR)
  await page.waitForURL(/verifier-email/, { timeout: 15000 }).catch(() => {})
  const h1_1 = await page.locator('h1').first().innerText()
  await shot('01-inscription')
  record(1, 'Créer un compte → « Confirmer votre adresse »',
    page.url().includes('verifier-email') && h1_1.includes('Confirmer votre adresse'),
    `URL ${page.url()} · h1 « ${h1_1} »`)

  // ---------------------------------------------------------------- 2
  const mail1 = await mailpitLatest(EMAIL_FR)
  const sujet1 = mail1?.Subject ?? '(aucun e-mail)'
  const corps1 = `${mail1?.Text ?? ''}`
  const estFr = /confirm|adresse|Bonjour|activer/i.test(`${sujet1} ${corps1}`) && !/[؀-ۿ]/.test(sujet1)
  record(2, 'E-mail présent dans Mailpit, en français',
    Boolean(mail1) && estFr,
    `Sujet « ${sujet1} »`)

  // ---------------------------------------------------------------- 3
  const lien1 = mail1 ? firstLink(mail1, /verifier-email|token=/) : null
  if (lien1) await page.goto(lien1, { waitUntil: 'networkidle' })
  const succes3 = page.locator('.alerte--succes')
  const vu3 = await succes3.count() ? await succes3.first().innerText() : '(pas d’alerte de succès)'
  const couleur3 = await succes3.count()
    ? await succes3.first().evaluate(el => getComputedStyle(el).backgroundColor + ' / ' + getComputedStyle(el).color)
    : 'n/a'
  await shot('03-verification')
  record(3, 'Lien de l’e-mail → « Votre adresse est confirmée »',
    vu3.includes('confirmée'),
    `Lien ${lien1 ? 'trouvé' : 'INTROUVABLE'} · alerte « ${vu3.trim()} » · couleurs ${couleur3}`)

  // ---------------------------------------------------------------- 4
  await page.goto(`${FRONT}/fr/app`, { waitUntil: 'networkidle' })
  const corpsApp = await page.locator('main.espace').innerText().catch(() => '(page espace absente)')
  await shot('04-espace')
  const uuidVu = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(corpsApp)
  record(4, '/fr/app affiche e-mail, statut, rôle candidat, UUID',
    corpsApp.includes(EMAIL_FR) && corpsApp.includes('Confirmée') && corpsApp.includes('candidat') && uuidVu,
    `e-mail ${corpsApp.includes(EMAIL_FR)} · statut ${corpsApp.includes('Confirmée')} · rôle ${corpsApp.includes('candidat')} · uuid ${uuidVu}`)

  // ---------------------------------------------------------------- 5
  await page.reload({ waitUntil: 'networkidle' })
  const apres5 = page.url()
  const corps5 = await page.locator('main.espace').innerText().catch(() => '')
  record(5, 'F5 → la session tient',
    apres5.includes('/fr/app') && corps5.includes(EMAIL_FR),
    `URL après rechargement ${apres5}`)

  // ---------------------------------------------------------------- 6
  await page.locator('.lien-deconnexion').click()
  await page.waitForURL(/connexion/, { timeout: 15000 }).catch(() => {})
  await page.goto(`${FRONT}/fr/app`, { waitUntil: 'networkidle' })
  await page.waitForURL(/connexion/, { timeout: 15000 }).catch(() => {})
  record(6, 'Déconnexion puis /fr/app → renvoi vers la connexion',
    page.url().includes('connexion'),
    `URL ${page.url()}`)

  // ---------------------------------------------------------------- 7
  await fill('input[type=email]', EMAIL_FR)
  await page.locator('input[type=password]').fill(PWD)
  await page.locator('button[type=submit]').click()
  await page.waitForURL(/\/fr\/app/, { timeout: 15000 }).catch(() => {})
  const corps7 = await page.locator('main.espace').innerText().catch(() => '')
  record(7, 'Reconnexion → retour à l’espace',
    page.url().includes('/fr/app') && corps7.includes(EMAIL_FR),
    `URL ${page.url()}`)

  // ---------------------------------------------------------------- 8
  await page.locator('.lien-deconnexion').click()
  await page.waitForURL(/connexion/, { timeout: 15000 }).catch(() => {})
  await page.goto(`${FRONT}/fr/mot-de-passe-oublie`, { waitUntil: 'networkidle' })
  await fill('input[type=email]', EMAIL_FR)
  await page.locator('button[type=submit]').click()
  await page.locator('.alerte--succes').waitFor({ timeout: 15000 }).catch(() => {})

  const mail2 = await mailpitLatest(EMAIL_FR)
  const lien2 = mail2 ? firstLink(mail2, /nouveau-mot-de-passe|token=/) : null
  let detail8 = `e-mail « ${mail2?.Subject ?? 'aucun'} » · lien ${lien2 ? 'trouvé' : 'INTROUVABLE'}`
  let ok8 = false

  if (lien2) {
    await page.goto(lien2, { waitUntil: 'networkidle' })
    const pw8 = page.locator('input[type=password]')
    await pw8.nth(0).fill(PWD2)
    await pw8.nth(1).fill(PWD2)
    await page.locator('button[type=submit]').click()
    await page.locator('.alerte--succes').waitFor({ timeout: 15000 }).catch(() => {})
    const conf8 = await page.locator('.alerte--succes').first().innerText().catch(() => '')
    await shot('08-nouveau-mdp')

    await page.goto(`${FRONT}/fr/connexion`, { waitUntil: 'networkidle' })
    await fill('input[type=email]', EMAIL_FR)
    await page.locator('input[type=password]').fill(PWD2)
    await page.locator('button[type=submit]').click()
    await page.waitForURL(/\/fr\/app/, { timeout: 15000 }).catch(() => {})
    ok8 = page.url().includes('/fr/app')
    detail8 += ` · confirmation « ${conf8.trim()} » · connexion avec le nouveau ${ok8 ? 'réussie' : 'ECHEC'}`
  }
  record(8, 'Mot de passe oublié → lien → nouveau mot de passe → connexion', ok8, detail8)

  // ---------------------------------------------------------------- 9
  await context.clearCookies()
  await respirer(page, 65)
  await inscrire('ar', EMAIL_AR)
  await page.waitForURL(/verifier-email/, { timeout: 15000 }).catch(() => {})
  const dir9 = await page.locator('html').getAttribute('dir')
  const lang9 = await page.locator('html').getAttribute('lang')
  const h1_9 = await page.locator('h1').first().innerText()
  await shot('09-arabe-rtl')
  const mail3 = await mailpitLatest(EMAIL_AR)
  const sujet3 = mail3?.Subject ?? '(aucun)'
  const arabeMail = /[؀-ۿ]/.test(`${sujet3} ${mail3?.Text ?? ''}`)
  record(9, 'Reprise en /ar : interface arabe, RTL, e-mail en arabe',
    dir9 === 'rtl' && /[؀-ۿ]/.test(h1_9) && arabeMail,
    `dir="${dir9}" lang="${lang9}" · h1 « ${h1_9} » · e-mail « ${sujet3} » arabe=${arabeMail} · API ${dernieresReponses()}`)

  // ---------------------------------------------------------------- 10
  await context.clearCookies()
  await respirer(page, 65)
  await inscrire('ar', `court.${stamp}@naja7i.test`, { password: '12345678' })
  await page.locator('.champ__erreur').first().waitFor({ timeout: 15000 }).catch(() => {})
  const err10 = await page.locator('.champ__erreur').first().innerText().catch(() => '(aucun message)')
  const sousChamp10 = await page.locator('label.champ:has(input[type=password]) .champ__erreur').count()
  await shot('10-mdp-court')
  record(10, 'Mot de passe de 8 caractères → message sous le champ, bonne langue',
    sousChamp10 > 0 && /[؀-ۿ]/.test(err10),
    `message « ${err10.trim()} » · placé sous le champ mot de passe : ${sousChamp10 > 0} · en arabe : ${/[؀-ۿ]/.test(err10)} · API ${dernieresReponses()}`)

  // ---------------------------------------------------------------- 11
  await context.clearCookies()
  await respirer(page, 65)
  await inscrire('fr', `sanscgu.${stamp}@naja7i.test`, { skipCgu: true })
  await page.waitForTimeout(2500)
  const err11n = await page.locator('.champ__erreur').count()
  const err11 = err11n ? await page.locator('.champ__erreur').first().innerText() : ''
  const alerte11 = await page.locator('.alerte').count()
    ? await page.locator('.alerte').first().innerText() : ''
  const dansFieldset = await page.locator('fieldset.actes .champ__erreur').count()
  await shot('11-cgu')
  record(11, 'CGU décochées → refus, message sous la case',
    !page.url().includes('verifier-email') && dansFieldset > 0,
    `URL ${page.url()} · messages sous la case : ${dansFieldset} · texte « ${(err11 || alerte11).trim()} » · API ${dernieresReponses()}`)

} catch (e) {
  console.log('\n!!! INTERRUPTION:', e.message)
} finally {
  console.log('\n================ SYNTHESE ================')
  for (const r of results) console.log(`${r.n}. ${r.ok ? 'OK' : 'ECHEC'} — ${r.label}`)
  console.log(`\nAppels directs du navigateur vers l'API (doit être 0) : ${directApiCalls.length}`)
  for (const u of [...new Set(directApiCalls)]) console.log(`   ${u}`)
  console.log(`\nCompte FR : ${EMAIL_FR}\nCompte AR : ${EMAIL_AR}`)
  console.log(JSON.stringify({ results, directApiCalls: [...new Set(directApiCalls)] }))
  await browser.close()
}
