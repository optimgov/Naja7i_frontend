#!/usr/bin/env node
/**
 * recette-portes.mjs — LA RÈGLE DES PORTES, éprouvée sur la page rendue.
 *
 *   node scripts/recette-portes.mjs [codeEpreuve]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE ÉPROUVE, ET POURQUOI AUCUN TEST DE COMPOSANT NE LE FERAIT
 *
 * « Un écran qui mesure offre toujours la porte qui le remplit. Aucun état vide
 * ne se termine sans un chemin cliquable vers l'action qui en sort. Et tout
 * élément qui a l'apparence d'un lien EST un lien. »
 *
 * Les cinq défauts de la recette humaine du 17 août sont tous des défauts de
 * CÂBLAGE : le composant existait, l'écran existait, et rien ne menait de l'un
 * à l'autre. Le configurateur d'entraînement était écrit depuis le 11 août sous
 * un commit intitulé « l'ordonnance devient cliquable » — et l'ordonnance
 * n'avait pas un seul `<a>` dans son corps.
 *
 * Un test qui monte le composant qu'il vérifie ne peut pas voir ça : il
 * construit lui-même ce qu'il mesure. Cette recette part du DOM RENDU, après
 * hydratation, et compte les ancres et les boutons — puis elle les CLIQUE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN COMPTE NEUF À CHAQUE EXÉCUTION, ET C'EST DÉLIBÉRÉ
 *
 * L'état du D-01 est « compte vérifié, ZÉRO tentative ». Une adresse
 * déterministe le perdrait dès la première exécution — la recette passerait
 * ensuite sur un tableau de bord rempli, sans jamais revoir l'écran vide, et
 * resterait verte quoi qu'il arrive au correctif. C'est le genre 4 du
 * bestiaire : la garde qu'on prétend éprouver n'est plus jamais exercée.
 *
 * Le compte est donc horodaté. Le coût est une ligne de plus dans `users` par
 * exécution sur un poste — en CI la base est neuve. C'est la dette DET-78, et
 * elle est préférée à un vert qui ne prouve rien.
 *
 * L'INSCRIPTION PASSE PAR LE FORMULAIRE PUBLIC, pas par l'API : c'est le geste
 * du candidat du 17 août, et c'est lui qui doit aboutir sur une porte.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

import { jetonDeVerification } from './recette/client-api.mjs'

const CODE_EPREUVE = process.argv[2] || 'CRMEF-FR-SPEC-2025'

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
const SORTIE = process.env.SORTIE || '/tmp/recette-portes'

const EMAIL = `recette.portes.${Date.now()}@naja7i.test`
const MOT_DE_PASSE = 'Recette-PORTES-2026!'

const resultats = []
const captures = []
const trafic = []

/** Un contrôle satisfait. */
const ok = (id, quoi, mesure) => resultats.push({ id, quoi, mesure, etat: 'ok' })

/** Un contrôle en échec — la recette sortira en 1. */
const ko = (id, quoi, mesure) => resultats.push({ id, quoi, mesure, etat: 'ko' })

/**
 * Un contrôle QU'ON N'A PAS PU EXERCER, et qui ne se déguise pas en vert.
 *
 * « Un rapport qui omet une action est plus grave que l'action. » Un contrôle
 * dont la condition d'entrée n'était pas réunie n'a rien prouvé ; le compter
 * comme réussi serait exactement le genre 4.
 */
const nonVerifie = (id, quoi, pourquoi) => resultats.push({ id, quoi, mesure: pourquoi, etat: 'nv' })

const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({ viewport: { width: 1280, height: 900 } })
const page = await contexte.newPage()

page.on('response', async (r) => {
  const url = r.url()
  if (!url.includes('/api/')) return
  let corps = ''
  try { corps = await r.text() } catch { corps = '(corps illisible)' }
  trafic.push({ methode: r.request().method(), url, statut: r.status(), corps })
})

async function capturer(nom) {
  const chemin = `${SORTIE}-${nom}.png`
  await page.screenshot({ path: chemin, fullPage: true })
  captures.push(chemin)
}

/**
 * LES ÉLÉMENTS CLIQUABLES DU CORPS, en-tête et pied EXCLUS.
 *
 * La mesure du 17 août était « le DOM ne contient, HORS EN-TÊTE, aucun `<a>`
 * ni `<button>` ». La navigation en porte toujours : les compter rendrait tout
 * écran conforme, y compris celui du défaut.
 *
 * `.enveloppe` NE CONVIENT PAS pour délimiter le corps, et c'est une leçon de
 * la première exécution de cette recette : la mise en page l'emploie AUSSI
 * pour sa barre d'en-tête (`enveloppe appli__barre`) et pour la boîte
 * d'échecs. Le sélecteur ramenait donc le logo, la bascule de langue et la
 * déconnexion — trois portes qui existent sur toutes les pages, y compris
 * celle du défaut. Un contrôle qui les compte est vert partout.
 *
 * On délimite donc par `main`, et on retire ce qui appartient à la mise en
 * page : la boîte d'échecs de la file d'envoi et les deux bascules.
 */
async function portesDuCorps() {
  return page.$$eval(
    'main a[href], main button',
    (elements) => elements
      .filter((e) => !e.closest('.echecs'))
      .filter((e) => !e.hasAttribute('data-bascule-theme') && !e.hasAttribute('data-bascule-langue'))
      .map((e) => ({
        balise: e.tagName.toLowerCase(),
        href: e.getAttribute('href'),
        texte: (e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
        desactive: e.hasAttribute('disabled'),
      })),
  )
}

// ══════════════════════════════════════════ PORTE-1 — la première porte (D-01)
console.log('1. inscription par le formulaire public')

await page.goto(`${BASE}/fr/inscription`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', EMAIL)
const motsDePasse = page.locator('input[type="password"]')
await motsDePasse.nth(0).fill(MOT_DE_PASSE)
await motsDePasse.nth(1).fill(MOT_DE_PASSE)

/* Les deux cases NON RÉVOCABLES seulement. Le consentement marketing est
 * séparé par conception : le cocher ici ferait passer la recette sur un chemin
 * que le candidat pressé n'emprunte pas. */
const cases = page.locator('.case__coche')
await cases.nth(0).check()
await cases.nth(1).check()

await page.click('button[type="submit"]')
await page.waitForURL('**/verifier-email**', { timeout: 20000 })

const jeton = await jetonDeVerification(EMAIL, MAILPIT)
if (!jeton) {
  console.error(`ÉCHEC — aucun jeton de vérification reçu pour ${EMAIL}`)
  await navigateur.close()
  process.exit(1)
}

await page.goto(`${BASE}/fr/verifier-email?token=${jeton}`, { waitUntil: 'networkidle' })

console.log('2. le tableau de bord d’un compte sans aucune tentative')
await page.goto(`${BASE}/fr/app`, { waitUntil: 'networkidle' })
await page.waitForSelector('main .titre-page', { timeout: 20000 })
await capturer('01-tableau-de-bord-vide')

const portesVide = await portesDuCorps()
const versDiagnostic = portesVide.filter((p) => (p.href ?? '').includes('/app/diagnostic/'))

if (portesVide.length === 0) {
  ko('PORTE-1', 'le tableau de bord d’un compte neuf offre une porte',
    'aucun <a> ni <button> dans le corps — c’est exactement le D-01')
} else if (versDiagnostic.length === 0) {
  ko('PORTE-1', 'le tableau de bord d’un compte neuf offre une porte',
    `${portesVide.length} élément(s) cliquable(s), aucun vers /app/diagnostic/ : `
    + portesVide.map((p) => p.href ?? p.texte).join(', '))
} else {
  ok('PORTE-1', 'le tableau de bord d’un compte neuf offre une porte',
    `${portesVide.length} cliquable(s) dans le corps, dont ${versDiagnostic.length} vers un seuil de diagnostic`)
}

/* On ne se contente pas de compter : on CLIQUE. Une ancre vers une route
 * inexistante compterait comme une porte et mènerait à un 404 — un lien mort
 * ment deux fois. */
console.log('3. la porte s’ouvre-t-elle ?')
if (versDiagnostic.length > 0) {
  await page.goto(`${BASE}${versDiagnostic[0].href}`, { waitUntil: 'networkidle' })
  const lancement = page.locator('.lancement .btn')
  const visible = await lancement.isVisible().catch(() => false)
  await capturer('02-seuil-du-diagnostic')

  if (visible) {
    ok('PORTE-1b', 'la porte mène au seuil du diagnostic, qui offre son lancement',
      `${versDiagnostic[0].href} → bouton de lancement présent`)
  } else {
    ko('PORTE-1b', 'la porte mène au seuil du diagnostic, qui offre son lancement',
      `${versDiagnostic[0].href} ne rend aucun bouton de lancement`)
  }
} else {
  nonVerifie('PORTE-1b', 'la porte mène au seuil du diagnostic',
    'aucune porte à ouvrir — voir PORTE-1')
}

// ═══════════════════════════════ PORTE-2 — le catalogue public mène au seuil
console.log('4. le catalogue public mène-t-il au seuil ?')

/* La famille n'est pas écrite en dur : on la lit dans le catalogue, comme un
 * candidat qui descend l'arborescence. Une famille codée ici cesserait de
 * suivre le produit le jour où le catalogue change. */
const familleOuverte = await page.evaluate(async () => {
  const r = await fetch('/api/v1/catalogue', { headers: { Accept: 'application/json' } })
  const corps = await r.json()
  return corps.data
    .flatMap((f) => f.families ?? [])
    .find((f) => f.availability === 'open')?.slug ?? null
})

if (familleOuverte === null) {
  nonVerifie('PORTE-2', 'la fiche de famille mène au seuil du diagnostic',
    'aucune famille ouverte au catalogue')
} else {
  await page.goto(`${BASE}/fr/concours/famille/${familleOuverte}`, { waitUntil: 'networkidle' })
  await capturer('03-famille')

  const portesFamille = (await portesDuCorps()).filter((p) => (p.href ?? '').includes('/app/diagnostic/'))

  if (portesFamille.length === 0) {
    ko('PORTE-2', 'la fiche de famille mène au seuil du diagnostic',
      `/fr/concours/famille/${familleOuverte} n’offre aucun chemin vers un diagnostic`)
  } else {
    ok('PORTE-2', 'la fiche de famille mène au seuil du diagnostic',
      `${portesFamille.length} épreuve(s) avec leur porte sur /fr/concours/famille/${familleOuverte}`)
  }
}

// ══════════════════════════ PORTE-4 — la question sautée n'est pas une erreur
console.log('5. passation — une question délibérément laissée sans réponse')

await page.goto(`${BASE}/fr/app/diagnostic/${CODE_EPREUVE}`, { waitUntil: 'networkidle' })
await page.locator('.lancement .btn').click()
await page.waitForURL('**/app/tentative/**', { timeout: 20000 })

const uuidTentative = page.url().split('/app/tentative/')[1].split(/[?#]/)[0]
console.log(`   tentative ${uuidTentative}`)

await page.waitForSelector('.option', { timeout: 15000 })
await capturer('04-question-1-sans-reponse')

/* LA MENTION DOIT ÊTRE LÀ AVANT LE CLIC. Un avertissement qui n'apparaîtrait
 * qu'après serait un constat, pas une information. */
const mentionSautee = await page.locator('.sautee').isVisible().catch(() => false)

/* Question 1 : on ne choisit RIEN et on avance. C'est le geste du D-09. */
const actes = page.locator('.passation__actes .btn')
await actes.nth(1).click()
await page.waitForTimeout(600)

const avanceSansReponse = await page.locator('.passation__compteur').textContent()
  .then((t) => /2/.test(t ?? ''))
  .catch(() => false)

if (!avanceSansReponse) {
  ko('PORTE-4a', 'on peut traverser une question sans y répondre',
    'l’écran n’a pas avancé — le produit modélise pourtant l’évitement (skipped_count)')
} else if (!mentionSautee) {
  ko('PORTE-4a', 'passer sans répondre est annoncé avant le clic',
    'l’écran avance sans dire que la question comptera comme non répondue')
} else {
  ok('PORTE-4a', 'passer sans répondre est possible ET annoncé avant le clic',
    'mention présente, l’écran avance à la question 2')
}

/* Les suivantes sont répondues normalement : il faut de l'évidence pour que la
 * maîtrise conclue quelque chose, et un seul saut à mesurer. */
console.log('6. les questions suivantes, répondues')
let n = 1
for (;;) {
  n += 1
  await page.waitForSelector('.option', { timeout: 15000 })

  const options = page.locator('.option__choix')
  await options.nth(n % (await options.count())).check()
  await page.locator('.certitude__radio').nth(n % 3).check()

  await page.locator('.passation__actes .btn').nth(1).click()
  await page.waitForTimeout(600)

  if (await page.locator('.voile').isVisible().catch(() => false)) break
  if (n > 40) throw new Error('Boucle de passation non terminée après 40 questions')
}

console.log('7. soumission')
await page.locator('.voile__actes .btn').first().click()
await page.waitForURL('**/correction', { timeout: 30000 })
await capturer('05-correction')

/*
 * LA MESURE DU D-09 SE FAIT SUR LES OCTETS.
 *
 * `answered_count` de la tentative est le VOLUME D'ÉVIDENCE. Avant le
 * correctif, l'écran envoyait `option_uuid: null` : une ligne de réponse
 * existait, `submit()` lui posait `is_correct = false`, et l'item comptait
 * comme une erreur démontrée. `answered_count` valait donc le nombre d'items
 * SERVIS, pas répondus.
 */
const etat = await page.evaluate(async (uuid) => {
  const r = await fetch(`/api/v1/me/attempts/${uuid}`, { headers: { Accept: 'application/json' } })
  return r.json()
}, uuidTentative)

const servis = etat?.data?.item_count ?? 0
const repondus = etat?.data?.answered_count ?? 0

if (servis === 0) {
  nonVerifie('PORTE-4b', 'une question sautée n’entre pas dans le volume d’évidence',
    'la tentative n’a pas pu être relue')
} else if (repondus >= servis) {
  ko('PORTE-4b', 'une question sautée n’entre pas dans le volume d’évidence',
    `${repondus} réponses pour ${servis} questions servies, alors qu’une a été sautée — `
    + 'l’écran a fabriqué une réponse vide, comptée comme une erreur démontrée')
} else {
  ok('PORTE-4b', 'une question sautée n’entre pas dans le volume d’évidence',
    `${repondus} réponses pour ${servis} questions servies`)
}

/* Et la maîtrise le DIT : la page rendue porte « Sautées : n ». */
await page.goto(`${BASE}/fr/app/maitrise/${CODE_EPREUVE}`, { waitUntil: 'networkidle' })
await capturer('06-maitrise')

const texteMaitrise = (await page.locator('main').textContent()) ?? ''

if (/Sautées\s*:/.test(texteMaitrise)) {
  ok('PORTE-4c', 'la maîtrise compte l’évitement pour ce qu’il est',
    'la page rendue porte « Sautées : … »')
} else {
  ko('PORTE-4c', 'la maîtrise compte l’évitement pour ce qu’il est',
    'aucune mention « Sautées » sur la maîtrise : la question sautée a été rangée ailleurs')
}

// ═════════════════════════════════ PORTE-3 — l'ordonnance est cliquable (D-06)
console.log('8. l’ordonnance')

await page.goto(`${BASE}/fr/app/ordonnance/${CODE_EPREUVE}`, { waitUntil: 'networkidle' })
await page.waitForSelector('main .titre-page', { timeout: 20000 })
await capturer('07-ordonnance')

const lignes = await page.locator('.plan__ligne').count()
const portesOrdonnance = (await portesDuCorps())
  .filter((p) => (p.href ?? '').includes('/app/entrainement/'))

if (lignes === 0) {
  nonVerifie('PORTE-3', 'chaque ligne d’ordonnance mène à son entraînement',
    'aucune ligne d’ordonnance à cet instant')
} else if (portesOrdonnance.length === 0) {
  ko('PORTE-3', 'chaque ligne d’ordonnance mène à son entraînement',
    `${lignes} ligne(s), et aucun <a> ni <button> vers l’entraînement dans le corps — c’est le D-06`)
} else if (portesOrdonnance.length < lignes) {
  ko('PORTE-3', 'chaque ligne d’ordonnance mène à son entraînement',
    `${portesOrdonnance.length} porte(s) pour ${lignes} ligne(s) : certaines lignes recommandent sans mener`)
} else {
  ok('PORTE-3', 'chaque ligne d’ordonnance mène à son entraînement',
    `${portesOrdonnance.length} porte(s) pour ${lignes} ligne(s)`)
}

/* Le domaine doit ARRIVER coché. Une porte qui perd le choix qu'on vient de
 * faire renvoie le candidat à la case départ, et le serveur pourrait composer
 * la série sur un autre domaine que celui qu'il a cliqué. */
if (portesOrdonnance.length > 0) {
  const cible = portesOrdonnance[0].href
  const uuidVise = new URL(cible, BASE).searchParams.get('domaine')

  await page.goto(`${BASE}${cible}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.choix', { timeout: 20000 })
  await capturer('08-entrainement-prereglee')

  const coche = await page.$eval(
    '.choix:has(.choix__radio:checked)',
    (e) => e.getAttribute('data-domaine'),
  ).catch(() => null)

  if (uuidVise === null) {
    ko('PORTE-3b', 'la porte transporte le domaine de sa ligne',
      `${cible} ne porte aucun paramètre « domaine »`)
  } else if (coche !== uuidVise) {
    ko('PORTE-3b', 'la porte transporte le domaine de sa ligne',
      `attendu ${uuidVise} coché, trouvé ${coche ?? 'aucun'}`)
  } else {
    ok('PORTE-3b', 'la porte transporte le domaine de sa ligne',
      `le configurateur arrive avec ${uuidVise} coché`)
  }
} else {
  nonVerifie('PORTE-3b', 'la porte transporte le domaine de sa ligne', 'aucune porte à suivre')
}

// ══════════════════════════════════ PORTE-5 — la question miroir (D-06 bis)
console.log('9. la question miroir — l’écran que personne n’a vu fonctionner')

await page.goto(`${BASE}/fr/app/tentative/${uuidTentative}/correction`, { waitUntil: 'networkidle' })
await page.waitForSelector('.lignes', { timeout: 20000 })

const boutonsMiroir = page.locator('.miroir__action')
const combienMiroirs = await boutonsMiroir.count()

if (combienMiroirs === 0) {
  nonVerifie('PORTE-5', 'la question miroir est atteignable depuis la correction',
    'aucune ligne ne porte `mirror_available` sur cette série — la banque de recette '
    + 'n’offre aucune sœur au même piège. Le chemin reste NON PARCOURU.')
} else {
  const balise = await boutonsMiroir.first().evaluate((e) => e.tagName.toLowerCase())
  await capturer('09-correction-miroir')

  if (balise !== 'button' && balise !== 'a') {
    ko('PORTE-5', 'la question miroir est atteignable depuis la correction',
      `« Vérifier sur une autre question » est un <${balise}> : l’apparence d’action sans l’action`)
  } else {
    await boutonsMiroir.first().click()

    /*
     * ON ATTEND UNE SÉRIE, PAS UNE ADRESSE QUI RESSEMBLE À UNE SÉRIE.
     *
     * Première écriture : `waitForURL('**\/app\/tentative\/**')`. On était DÉJÀ
     * sur `/app/tentative/<uuid>/correction`, qui satisfait ce motif : l'attente
     * rendait la main immédiatement, avant la navigation. La recette lisait
     * alors « <uuid>/correction » comme un identifiant de série, interrogeait
     * `/me/attempts/<uuid>/correction`, y trouvait un tableau sans `kind`, et
     * concluait « genre ? et non mirror ».
     *
     * Le miroir fonctionnait parfaitement : `POST me/mirrors/{item}` rendait
     * 201 avec `kind: mirror`. C'était le contrôle qui accusait du code juste —
     * le genre 2 du bestiaire, commis ici même.
     */
    await page
      .waitForURL((u) => /\/app\/tentative\/[^/]+$/.test(new URL(u).pathname), { timeout: 20000 })
      .catch(() => {})

    const chemin = new URL(page.url()).pathname
    const uuidMiroir = /\/app\/tentative\/([^/]+)$/.exec(chemin)?.[1] ?? null
    await capturer('10-question-miroir')

    if (uuidMiroir === null || uuidMiroir === uuidTentative) {
      ko('PORTE-5', 'la question miroir est atteignable depuis la correction',
        `le clic n’a pas ouvert de nouvelle série (url : ${page.url()})`)
    } else {
      /* Le genre est LU sur les octets, pas déduit de l'URL : une série
       * d'entraînement et une série miroir ont la même adresse. */
      const serie = await page.evaluate(async (uuid) => {
        const r = await fetch(`/api/v1/me/attempts/${uuid}`, { headers: { Accept: 'application/json' } })
        return r.json()
      }, uuidMiroir)

      const genre = serie?.data?.kind ?? '?'

      if (genre !== 'mirror') {
        ko('PORTE-5', 'la question miroir est atteignable depuis la correction',
          `série ouverte de genre « ${genre} » et non « mirror »`)
      } else {
        ok('PORTE-5', 'la question miroir est atteignable depuis la correction',
          `série « mirror » ${uuidMiroir}, ${serie.data.item_count} question(s)`)
      }
    }
  }
}

await navigateur.close()

// ═════════════════════════════════════════════════════════════════ verdict
writeFileSync(`${SORTIE}-trafic.json`, JSON.stringify(trafic, null, 2))
writeFileSync(
  `${SORTIE}-rapport.json`,
  JSON.stringify({ compte: EMAIL, tentative: uuidTentative, resultats, captures }, null, 2),
)

console.log('\n── Verdict ──')
for (const r of resultats) {
  const marque = r.etat === 'ok' ? 'ok  ' : r.etat === 'ko' ? '✗   ' : '?   '
  console.log(`${marque}${r.id} ${r.quoi}\n      ${r.mesure}`)
}

const echecs = resultats.filter((r) => r.etat === 'ko')
const inconnus = resultats.filter((r) => r.etat === 'nv')

console.log(
  `\n${resultats.filter((r) => r.etat === 'ok').length} porte(s) tenue(s), `
  + `${echecs.length} en échec, ${inconnus.length} non vérifiée(s).`,
)

if (inconnus.length) {
  console.log('\nNON VÉRIFIÉ — ce qui suit n’a pas été exercé, et n’est donc prouvé par rien :')
  for (const r of inconnus) console.log(`  · ${r.id} — ${r.mesure}`)
}

console.log(`captures : ${captures.length}`)

process.exit(echecs.length ? 1 : 0)
