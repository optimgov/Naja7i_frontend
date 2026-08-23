#!/usr/bin/env node
/**
 * recette-simulation.mjs — l'examen blanc, de bout en bout.
 *
 * PALIER ÉPROUVÉ : DECOUVERTE-7J (`recette.entree@naja7i.test`).
 * `simulator.full` est dans le SOCLE payant, composé par les trois offres.
 * On prend donc la plus petite : si le socle suffit, on le prouve — le
 * mesurer sur « Session complète » laisserait croire qu'il faut la profondeur.
 *
 *   node scripts/recette-simulation.mjs <email> <motDePasse> [codeEpreuve]
 *
 * Cinq cas, et ce sont ceux qui coûtent cher s'ils cassent :
 *
 *   1. le seuil annonce ce que l'épreuve reproduit — durée, sections, barème ;
 *   2. deux clics sur « lancer » ouvrent UNE simulation ;
 *   3. la note ne s'affiche JAMAIS pendant l'épreuve (R06) ;
 *   4. rechargement en pleine épreuve → reprise avec le temps SERVEUR ;
 *   5. une réponse après l'échéance → refusée, expliquée, épreuve close.
 *
 * Le cas 5 exige une échéance dépassée sur une épreuve de 240 minutes :
 * `scripts/recette/echoir-simulation.php` avance l'horloge de la tentative,
 * comme `echoir-revisions.php` avance celle du calendrier (D-F49). Il ne touche
 * QUE `expires_at` — clore est le travail du serveur, et c'est ce qu'on mesure.
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ICI = dirname(fileURLToPath(import.meta.url))
const FRONT = resolve(ICI, '..')

const [email, motDePasse, codeEpreuve = 'CRMEF-FR-SPEC-2025'] = process.argv.slice(2)

if (!email || !motDePasse) {
  console.error('Usage : node scripts/recette-simulation.mjs <email> <motDePasse> [codeEpreuve]')
  process.exit(2)
}

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const BACKEND = process.env.BACKEND_DIR || resolve(FRONT, '../Naja7i_backend_front')
const SORTIE = process.env.SORTIE || '/tmp/recette-simulation'

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

/** Avance l'horloge de la simulation ouverte. Voir l'en-tête. */
function echoirLaSimulation() {
  const r = spawnSync('php', ['artisan', 'tinker', `${ICI}/recette/echoir-simulation.php`], {
    cwd: BACKEND,
    encoding: 'utf8',
    env: { ...process.env, COMPTE_EMAIL: email, OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES' },
  })
  return r.status === 0
}

await connecter()

// ══════════════════════════════════════ 1. Le seuil dit ce qui attend ═══
{
  await page.goto(`${BASE}/fr/app/simulation/${codeEpreuve}`, { waitUntil: 'networkidle' })

  const texte = (await page.locator('main').innerText()) ?? ''
  const sections = await page.locator('.poids__ligne').count()

  /* La durée annoncée doit être CELLE DU RÉFÉRENTIEL, pas une constante de
   * l'écran : on la relit sur la route publique et on compare. */
  const referentiel = JSON.parse((await api(`/catalogue/epreuves/${codeEpreuve}/competences`)).corps)
  const minutes = referentiel.meta.exam.duration_minutes
  const heures = Math.floor(minutes / 60)

  /*
   * ON COMPARE LES NOMBRES, PAS LA MISE EN FORME.
   *
   * La première écriture cherchait « 4 h » par expression régulière et
   * échouait sans rien apprendre — le libellé porte des espaces fines
   * insécables (U+202F), imposées par la lisibilité en RTL, et le message de
   * constat réaffichait ma propre variable au lieu du texte réel. Un test qui
   * ne montre pas ce qu'il a vu ne sert à rien le jour où il rougit.
   *
   * On lit donc les chiffres du bloc « Durée » et on les confronte à ceux du
   * référentiel. Le jour où la mise en forme change, le test reste juste.
   */
  const faitDuree = (await page.locator('.fait').first().innerText().catch(() => '')) ?? ''
  const chiffresAffiches = (faitDuree.match(/\d+/g) ?? []).map(Number)
  /* « 4 h » et non « 4 h 0 » : une durée ronde n'affiche pas ses minutes. */
  const reste = minutes % 60
  const chiffresAttendus = heures > 0 ? (reste === 0 ? [heures] : [heures, reste]) : [minutes]

  const dureeAffichee = chiffresAttendus.every((v, i) => chiffresAffiches[i] === v)

  note(
    'E9 — le seuil annonce la durée officielle',
    dureeAffichee,
    `référentiel : ${minutes} min → attendu [${chiffresAttendus}] · `
      + `écran : « ${faitDuree.replace(/\n/g, ' ')} » → [${chiffresAffiches}]`,
  )

  note(
    'E9 — les sections annoncées sont les domaines pondérés',
    sections > 0,
    `${sections} domaine(s) pondéré(s) affiché(s)`,
  )

  /* Le barème n'est pas public : l'écran doit le DIRE, pas le combler. */
  note(
    'E9 — le barème est annoncé comme non publié',
    /non publié|non précisé/i.test(texte),
    `mention trouvée : ${/non publié|non précisé/i.test(texte)}`,
  )

  note(
    'E9 — les conditions sont dites avant le lancement',
    /chronomètre|chronometre/i.test(texte) && /pause/i.test(texte),
    'chronomètre strict et absence de pause annoncés',
  )

  await page.screenshot({ path: `${SORTIE}-01-seuil.png`, fullPage: true })
}

// ═══════════════════════════════ 2. Deux clics ouvrent UNE simulation ═══
let uuidSimulation = null
{
  const avant = trafic.filter((t) => t.methode === 'POST' && t.url.includes('/me/simulations/')).length

  const bouton = page.locator('button.btn--grand')

  /*
   * LES DEUX GARDES SE MESURENT SÉPARÉMENT, et c'est le patron du FRONT-4.
   *
   * Lancer deux clics concurrents par Playwright ne mesure rien d'utile : le
   * second se heurte aux contrôles d'actionnabilité — bouton désactivé, puis
   * élément détaché par la navigation — et le test échoue sur son propre
   * outillage plutôt que sur le produit. On mesure donc les deux gardes là où
   * elles agissent :
   *
   *   1. LE BOUTON SE VERROUILLE dès le premier clic (garde d'interface) ;
   *   2. DEUX POST À CLÉ IDENTIQUE rendent la MÊME tentative (garde de contrat,
   *      la seule qui tienne si l'interface est contournée).
   */
  await bouton.click()
  const desactive = await bouton.isDisabled().catch(() => false)

  await page.waitForURL('**/app/tentative/**', { timeout: 30000 })
  uuidSimulation = page.url().split('/app/tentative/')[1].split(/[?#]/)[0]

  const cle = `recette-sim-${Date.now()}`
  const a = await api(`/me/simulations/${codeEpreuve}`, { method: 'POST', headers: { 'Idempotency-Key': cle } })
  const b = await api(`/me/simulations/${codeEpreuve}`, { method: 'POST', headers: { 'Idempotency-Key': cle } })
  const memeUuid = JSON.parse(a.corps).data?.uuid === JSON.parse(b.corps).data?.uuid

  const ouvertes = JSON.parse((await api('/me/attempts')).corps).data
    .filter((x) => x.kind === 'simulation' && x.status === 'in_progress')

  const posts = trafic.filter((t) => t.methode === 'POST' && t.url.includes('/me/simulations/')).length - avant

  note(
    'E9 — deux clics sur « lancer » ouvrent UNE simulation',
    desactive && memeUuid && ouvertes.length === 1,
    `bouton désactivé : ${desactive} · deux POST à clé identique → même tentative : ${memeUuid} · `
      + `${ouvertes.length} simulation ouverte · ${posts} appel(s)`,
  )
}

// ══════════════════════════════ 3. Aucune note pendant l'épreuve (R06) ═══
{
  const html = await page.content()
  const tentative = JSON.parse((await api(`/me/attempts/${uuidSimulation}`)).corps).data

  const chrono = await page.locator('.passation__temps').count()
  const grille = await page.locator('.grille__case').count()

  note(
    'E10 — le chronomètre serveur est affiché en permanence',
    chrono === 1 && tentative.seconds_remaining !== null,
    `chronomètre rendu : ${chrono} · seconds_remaining = ${tentative.seconds_remaining}`,
  )

  note(
    'E10 — la grille des questions permet la navigation',
    grille === tentative.item_count,
    `${grille} case(s) pour ${tentative.item_count} question(s)`,
  )

  /* R06 : ni correction, ni score, ni justification. Le contrat ne les sert
   * pas, et le CSS de `data-zone="examen"` les masquerait de toute façon. */
  const fuites = ['is_correct', 'rationale', 'weighted_percent', 'correct_count":']
    .filter((m) => html.includes(m))

  note(
    'E10 — la note ne s’affiche jamais pendant l’épreuve',
    fuites.length === 0 && tentative.correct_count === null,
    `fuites dans le HTML : ${fuites.length ? fuites.join(', ') : 'aucune'} · correct_count = ${tentative.correct_count}`,
  )

  /* Le rapport lui-même doit refuser tant que l'épreuve est en cours. */
  const rapportTrop_tot = await api(`/me/simulations/${uuidSimulation}/report`)
  const codeTropTot = (() => { try { return JSON.parse(rapportTrop_tot.corps).error.code } catch { return '—' } })()

  note(
    'E10 — le rapport est refusé tant que l’épreuve est en cours',
    rapportTrop_tot.statut === 409 && codeTropTot === 'ATTEMPT_NOT_SUBMITTED',
    `${rapportTrop_tot.statut} ${codeTropTot}`,
  )

  await page.screenshot({ path: `${SORTIE}-02-passation.png`, fullPage: true })
}

// ═══════════════════ 4. Rechargement : le temps vient du SERVEUR ═══
{
  /* On répond à une question, on marque, puis on recharge. Le compte à rebours
   * doit REPRENDRE là où le serveur en est — pas repartir de la durée pleine. */
  /* Sélecteurs PORTÉS PAR LA PASSATION : `.btn:not(.btn--fantome)` seul
   * attrapait un bouton du gabarit d'application, et la réponse ne partait
   * jamais — le test mesurait alors son propre défaut de ciblage. */
  await page.locator('.option').first().click()
  await page.locator('.certitude__option').first().click()
  await page.locator('.passation__actes .btn:not(.btn--fantome)').first().click()
  await page.waitForTimeout(1000)

  const avantRechargement = JSON.parse((await api(`/me/attempts/${uuidSimulation}`)).corps).data.seconds_remaining

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  const apresRechargement = JSON.parse((await api(`/me/attempts/${uuidSimulation}`)).corps).data.seconds_remaining
  const affiche = (await page.locator('.passation__temps-valeur').innerText().catch(() => '')) ?? ''
  const repondues = JSON.parse((await api(`/me/attempts/${uuidSimulation}`)).corps).data.answered_count

  /* Le temps ne remonte jamais, et il n'est pas revenu à la durée pleine. */
  const duree = JSON.parse((await api(`/catalogue/epreuves/${codeEpreuve}/competences`)).corps)
    .meta.exam.duration_minutes * 60

  note(
    'E10 — le rechargement reprend avec le temps SERVEUR',
    apresRechargement <= avantRechargement && apresRechargement < duree,
    `avant ${avantRechargement} s · après ${apresRechargement} s · durée pleine ${duree} s · affiché « ${affiche} »`,
  )

  note(
    'E10 — la réponse déjà donnée survit au rechargement',
    repondues >= 1,
    `${repondues} réponse(s) enregistrée(s)`,
  )
}

// ═════════════ 5. Une réponse après l'échéance : refusée et expliquée ═══
{
  if (!echoirLaSimulation()) {
    note('E10 — échéance dépassée', false, 'le script d’expiration a échoué')
  } else {
    /* On répond DANS l'écran, comme un candidat qui composait encore quand le
     * temps s'est écoulé. Le serveur doit refuser avec son code propre. */
    await page.locator('.option').nth(1).click().catch(() => {})
    await page.locator('.certitude__option').nth(1).click().catch(() => {})
    await page.locator('.passation__actes .btn:not(.btn--fantome)').first().click().catch(() => {})
    await page.waitForTimeout(2000)

    const refus = trafic.filter((t) => t.methode === 'PUT' && t.statut === 409).pop()
    const codeRefus = (() => { try { return JSON.parse(refus?.corps ?? '{}').error.code } catch { return '—' } })()

    note(
      'E10 — une réponse après l’échéance est refusée par son propre code',
      codeRefus === 'ATTEMPT_EXPIRED',
      `dernier PUT refusé : ${refus?.statut ?? '—'} ${codeRefus}`,
    )

    const texteEcran = (await page.locator('main').innerText().catch(() => '')) ?? ''

    note(
      'E10 — l’écran EXPLIQUE le refus, il ne le subit pas',
      /temps est écoulé|temps écoulé/i.test(texteEcran),
      `message affiché : ${/temps est écoulé/i.test(texteEcran) ? 'oui' : `non — « ${texteEcran.slice(0, 120)} »`}`,
    )

    await page.screenshot({ path: `${SORTIE}-03-echeance.png`, fullPage: true })

    /* Le serveur a-t-il CLOS la tentative ? C'est la moitié de la règle. */
    const apres = JSON.parse((await api(`/me/attempts/${uuidSimulation}`)).corps).data

    note(
      'E10 — la tentative expirée est close par le SERVEUR',
      apres.status === 'expired' && apres.submitted_at !== null,
      `statut = ${apres.status} · soumise à ${apres.submitted_at ?? '—'}`,
    )
  }
}

// ══════════════════════════════════════════════ 6. E11 — le rapport ═══
{
  await page.goto(`${BASE}/fr/app/simulation/${uuidSimulation}/rapport`, { waitUntil: 'networkidle' })

  /* On ATTEND la note plutôt qu'un délai fixe : la première visite de cette
   * page peut CLORE la tentative côté serveur, et le rendu suit la clôture. */
  await page.locator('.note__etiquette').waitFor({ timeout: 15000 }).catch(() => {})

  const rapport = JSON.parse((await api(`/me/simulations/${uuidSimulation}/report`)).corps).data
  const texte = (await page.locator('main').innerText()) ?? ''
  const sections = await page.locator('.section').count()

  note(
    'E11 — la note blanche est affichée, au barème pondéré',
    /* `innerText()` rend le texte TEL QU'AFFICHÉ : `.note__etiquette` porte
     * `text-transform: uppercase`, donc « NOTE BLANCHE ». Comparer sans tenir
     * compte de la casse, sinon le test échoue sur une règle de style. */
    /note blanche/i.test(texte) && rapport.score.weighted_percent !== undefined,
    `weighted_percent = ${rapport.score.weighted_percent} · weight_covered = ${rapport.score.weight_covered}`,
  )

  note(
    'E11 — le détail par section porte son volume d’évidence',
    sections === rapport.sections.length && rapport.sections.every((s) => typeof s.asked === 'number'),
    `${sections} section(s) rendue(s) · toutes avec « asked »`,
  )

  note(
    'E11 — la note n’est jamais présentée comme une note sur 20',
    /pourcentage pondéré/i.test(texte) && !/\/\s*20\b/.test(texte),
    `mention « pourcentage pondéré » : ${/pourcentage pondéré/i.test(texte)}`,
  )

  /* AUCUNE PRÉDICTION. On scanne l'écran, pas la charge utile : c'est ce que
   * le candidat lit qui compte. Les citations officielles du descriptif sont
   * autorisées à contenir « admission » — on cherche des VERDICTS. */
  const predictions = ['vous seriez', 'vous serez admis', 'probabilité', 'vos chances', 'pronostic']
    .filter((m) => new RegExp(m, 'i').test(texte))

  note(
    'E11 — aucune prédiction de réussite, sous aucune forme',
    predictions.length === 0,
    predictions.length ? `TROUVÉ : ${predictions.join(', ')}` : 'aucun verdict prédictif à l’écran',
  )

  const versOrdonnance = await page.locator(`a[href*="/app/ordonnance/"]`).count()
  const versEntrainement = await page.locator(`a[href*="/app/entrainement/"]`).count()

  note(
    'E11 — le rapport renvoie vers l’ordonnance et l’entraînement',
    versOrdonnance >= 1 && versEntrainement >= 1,
    `${versOrdonnance} lien(s) ordonnance · ${versEntrainement} lien(s) entraînement`,
  )

  await page.screenshot({ path: `${SORTIE}-04-rapport.png`, fullPage: true })

  // Bascule arabe : RTL complet, dir="auto" sur les chaînes d'API.
  await page.goto(`${BASE}/ar/app/simulation/${uuidSimulation}/rapport`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
  const lang = await page.evaluate(() => document.documentElement.getAttribute('lang'))
  /*
   * SEULES LES CHAÎNES VENANT DE L'API portent `dir="auto"` — la règle ne vise
   * qu'elles. `.officiel__ligne--absent` est un libellé i18n, traduit dans la
   * langue de la page : lui réclamer `dir="auto"` était une faute de MON test,
   * pas du produit. Les citations du descriptif, elles, viennent de l'API et
   * doivent l'avoir.
   */
  const sansDir = await page.evaluate(
    () => [...document.querySelectorAll(
      '.section__nom, .officiel__ligne:not(.officiel__ligne--absent), .note__base, .note__bareme',
    )].filter((e) => e.getAttribute('dir') !== 'auto').length,
  )

  note(
    'E11 — bascule arabe, RTL et dir="auto" sur les chaînes d’API',
    dir === 'rtl' && lang === 'ar' && sansDir === 0,
    `dir=${dir}, lang=${lang} · ${sansDir} chaîne(s) d’API sans dir="auto"`,
  )

  await page.screenshot({ path: `${SORTIE}-05-rapport-arabe.png`, fullPage: true })
}

// ═══════ 7. Captures : trois écrans × FR/AR × clair/sombre ═══════
/*
 * DOUZE CAPTURES, ET ELLES NE SONT PAS DÉCORATIVES.
 *
 * `auditer-ecrans.mjs` ne couvre que les écrans PUBLICS : les trois écrans du
 * simulateur exigent une session et l'uuid d'une tentative réelle, qu'aucune
 * liste statique ne peut connaître. Ils relèvent donc des « écrans sous
 * session », audités depuis leur propre recette — c'est déjà le partage retenu
 * pour les six écrans de la boucle candidat.
 *
 * Le thème se bascule par le MÊME sélecteur que l'auditeur (`[data-bascule-
 * theme]`) : deux façons de basculer finiraient par diverger, et l'une des deux
 * mesurerait alors autre chose que ce que voit le candidat.
 */
{
  const ECRANS = [
    ['seuil', (l) => `${BASE}/${l}/app/simulation/${codeEpreuve}`],
    ['passation', (l) => `${BASE}/${l}/app/tentative/${uuidSimulation}`],
    ['rapport', (l) => `${BASE}/${l}/app/simulation/${uuidSimulation}/rapport`],
  ]

  let posees = 0
  let conformes = 0

  for (const [nom, url] of ECRANS) {
    for (const langue of ['fr', 'ar']) {
      for (const theme of ['clair', 'sombre']) {
        /*
         * LE THÈME SE POSE PAR SON COOKIE, ET LA CAPTURE VÉRIFIE CE QU'ELLE A
         * OBTENU. Première écriture : cliquer sur la bascule quand
         * `data-theme` differait de la cible. Elle produisait douze fichiers
         * dont la moitié portait un nom faux — le clair est l'état SANS
         * attribut (`useThemeApplique` ne l'écrit que pour le sombre), donc la
         * comparaison à « clair » était toujours vraie et basculait à contre-
         * sens. Une capture mal nommée est pire qu'une capture manquante : on
         * la relit en croyant avoir vu l'autre thème.
         */
        await contexte.addCookies([{ name: 'naja7i_theme', value: theme, url: BASE }])
        await page.goto(url(langue), { waitUntil: 'networkidle' })

        const attribut = await page.evaluate(
          () => document.documentElement.getAttribute('data-theme'),
        )
        if (theme === 'sombre' ? attribut === 'sombre' : attribut === null) conformes += 1

        await page.screenshot({ path: `${SORTIE}-10-${nom}-${langue}-${theme}.png`, fullPage: true })
        posees += 1
      }
    }
  }

  note(
    'captures — trois écrans × FR/AR × clair/sombre',
    posees === 12 && conformes === 12,
    `${posees} capture(s) posées sous ${SORTIE}-10-* · ${conformes}/12 au thème réellement demandé`,
  )
}

await navigateur.close()

const echecs = resultats.filter((r) => !r.ok)
writeFileSync(`${SORTIE}.json`, JSON.stringify(resultats, null, 2))

console.log(`\n── ${resultats.length - echecs.length}/${resultats.length} cas conformes ──`)
process.exit(echecs.length === 0 ? 0 : 1)
