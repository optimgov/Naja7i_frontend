#!/usr/bin/env node
/**
 * recette-abonnement.mjs — le chemin de revenu, de bout en bout.
 *
 * PALIER ÉPROUVÉ : ESSAI → ACTIF, sur un compte NEUF à chaque exécution.
 * C'est la CONVERSION qu'elle mesure. Elle est irréversible (ADR-0033) : la
 * rejouer sur un compte fixe mesurerait, dès la deuxième fois, un compte déjà
 * converti — l'inverse exact de ce qu'elle éprouve.
 *
 *   node scripts/recette-abonnement.mjs <email> <motDePasse>
 *
 * CE QU'ELLE ÉPROUVE, et c'est le parcours entier :
 *
 *   1. le paiement simulé n'existe pas dans le bundle de production ;
 *   2. `/tarifs` annonce ce que le candidat GAGNE, jamais un nom de capacité ;
 *   3. le mur payant mène aux offres — pas un bouton grisé ;
 *   4. saisir un coupon crée une commande EN ATTENTE, et rien d'autre :
 *      la cause reste FERMÉE ;
 *   5. l'équipe valide (par script, comme le ferait le back-office) ;
 *   6. le candidat recharge : la cause est OUVERTE.
 *
 * LE POINT 4 EST LE PLUS IMPORTANT. Un coupon qui ouvrirait seul serait de la
 * monnaie au porteur. La recette vérifie donc l'état INTERMÉDIAIRE, celui où le
 * candidat a saisi son code et n'a encore rien reçu — l'état qu'aucun test
 * unitaire ne voit, parce qu'il est fait de deux appels séparés par un humain.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ELLE POSE SON ÉTAT DE DÉPART, elle ne l'espère pas.
 *
 * « La cause est fermée avant » n'est vrai que si le quota gratuit est épuisé.
 * Le laisser dépendre de ce que les recettes précédentes ont consommé ferait
 * mesurer autre chose selon la machine et selon l'ordre — le défaut corrigé au
 * D-F49, puis retrouvé au BLOC-1. `epuiser-quota.php` le pose.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ICI = dirname(fileURLToPath(import.meta.url))
const FRONT = resolve(ICI, '..')

const [email, motDePasse] = process.argv.slice(2)

if (!email || !motDePasse) {
  console.error('Usage : node scripts/recette-abonnement.mjs <email> <motDePasse>')
  process.exit(2)
}

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const BACKEND = process.env.BACKEND_DIR || resolve(FRONT, '../Naja7i_backend_front')
const SORTIE = process.env.SORTIE || '/tmp/recette-abonnement'
const EN_DEV = Boolean(process.env.RECETTE_DEV)

/**
 * `ok` vaut `true`, `false`, ou `null` — NON MESURÉ.
 *
 * Le troisième état existe pour un seul cas : le bundle de production, qui
 * n'est pas construit en mode `recette:dev`. Le compter comme réussi ferait
 * exactement ce que ce lot a déjà payé une fois — annoncer une garantie sans
 * l'avoir mesurée. Il est donc dit à voix haute et exclu du décompte.
 */
const resultats = []
const note = (cas, ok, constate) => {
  resultats.push({ cas, ok, constate })
  const marque = ok === null ? '  —   ' : ok ? '  ok  ' : '  ✗   '
  console.log(`${marque}${cas}\n        ${constate}`)
}

/** Un appel `php artisan tinker` sur un script de recette. */
function tinker(script, env = {}) {
  const r = spawnSync('php', ['artisan', 'tinker', `${ICI}/recette/${script}`], {
    cwd: BACKEND,
    encoding: 'utf8',
    env: { ...process.env, ...env, OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES' },
  })
  return { code: r.status, sortie: (r.stdout ?? '') + (r.stderr ?? '') }
}

const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } })
const page = await contexte.newPage()

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

const causeFermee = correction => correction.data.filter(l => l.cause_locked).length

/**
 * Une tentative QUI PORTE UNE CAUSE FERMÉE — pas simplement la dernière.
 *
 * Prendre « la dernière soumise » paraissait suffisant, et la première tournée
 * l'a validé par chance : cette tentative-là contenait une erreur non révélée.
 * À la tournée suivante, la dernière tentative venait d'une autre recette, sans
 * aucune erreur en attente de cause — le mur n'avait rien à fermer, et le
 * contrôle « la cause reste fermée » comparait 0 à 0. Il aurait été vert quoi
 * qu'il arrive.
 *
 * On cherche donc le support du mur au lieu de le supposer, en remontant des
 * plus récentes vers les plus anciennes.
 */
async function tentativeAvecCauseFermee() {
  const reponse = await api('/me/attempts')
  const tentatives = JSON.parse(reponse.corps).data.filter(a => a.status !== 'in_progress')

  for (const tentative of [...tentatives].reverse()) {
    const correction = await api(`/me/attempts/${tentative.uuid}/correction`)
    if (correction.statut !== 200) continue

    if (causeFermee(JSON.parse(correction.corps)) > 0) return tentative
  }

  return null
}

// ══════════════════ 1. Le paiement simulé est absent du bundle ═══
{
  /*
   * LA GARANTIE DE COMPILATION SE MESURE, elle ne se commente pas.
   *
   * Ma première écriture posait un `v-if` sur une constante et affirmait en
   * commentaire que le code disparaissait du bundle. `grep` disait le
   * contraire : `orders/simulated` était bien là. Le contrôle est donc ici, sur
   * le bundle réellement produit, et non dans une phrase.
   */
  const sortieBuild = resolve(FRONT, '.output')

  if (EN_DEV) {
    note(
      'le paiement simulé n’existe pas dans le bundle de production',
      null,
      'NON MESURÉ : `recette:dev` sert le serveur de développement, sans .output/ frais',
    )
  }
  else if (!existsSync(sortieBuild)) {
    note(
      'le paiement simulé n’existe pas dans le bundle de production',
      false,
      '.output/ absent — la recette complète construit avant de mesurer',
    )
  }
  else {
    const r = spawnSync('grep', ['-rl', 'orders/simulated', sortieBuild], { encoding: 'utf8' })
    const trouve = (r.stdout ?? '').trim()

    note(
      'le paiement simulé n’existe pas dans le bundle de production',
      trouve === '',
      trouve === ''
        ? 'aucune occurrence de « orders/simulated » dans .output/'
        : `TROUVÉ dans : ${trouve.split('\n').slice(0, 3).join(', ')}`,
    )
  }
}

await connecter()

/* L'état de départ, POSÉ : quota gratuit épuisé, donc mur debout. */
const epuise = tinker('epuiser-quota.php', { COMPTE_EMAIL: email })

if (epuise.code !== 0) {
  note('le quota gratuit est épuisé avant de commencer', false, epuise.sortie.slice(-300))
}

// ══════════════════════════ 2. /tarifs annonce des GAINS ═══
{
  await page.goto(`${BASE}/fr/tarifs`, { waitUntil: 'networkidle' })

  const offres = await page.locator('.offre').count()
  const texte = await page.locator('main').innerText()
  const servies = JSON.parse((await api('/plans')).corps).data

  note(
    'les offres viennent de l’API, jamais d’un prix en dur',
    offres > 0 && offres === servies.length,
    `${offres} offre(s) à l’écran · ${servies.length} servie(s) par l’API`,
  )

  /*
   * AUCUN NOM DE CAPACITÉ À L'ÉCRAN : le candidat lit ce qu'il gagne.
   *
   * LES CODES VIENNENT DE L'API, PLUS D'UNE LISTE ÉCRITE ICI. La liste en dur
   * portait `certification.take` — une fonction qui n'existe pas — et ignorait
   * `questions.answer`, que les trois paliers ouvrent depuis D-CAT-1. Elle
   * cherchait donc une fuite impossible et laissait passer la seule qui
   * pouvait survenir : exactement le défaut que ce même lot a corrigé dans
   * `/tarifs`, et pour la même raison — une liste recopiée décrit un catalogue
   * qu'elle ne lit pas.
   *
   * On interroge maintenant ce que le serveur SERT vraiment. La recette suit le
   * catalogue sans qu'on ait à la rouvrir.
   */
  const codes = [...new Set(servies.flatMap(o => o.capabilities ?? []))]
  const fuites = codes.filter(c => texte.includes(c))

  note(
    'aucun nom de capacité n’est montré au candidat',
    fuites.length === 0,
    fuites.length ? `TROUVÉ : ${fuites.join(', ')}` : 'les gains sont écrits en clair',
  )

  /*
   * LE PRIX PORTE SA DEVISE ET SA FINE INSÉCABLE.
   *
   * On n'attend la fine que si le montant a des milliers : « 199 MAD » n'en a
   * pas besoin, et l'exiger ferait rougir la recette sur un prix juste. On
   * vérifie donc la règle telle qu'elle est — fine SI milliers — et jamais
   * l'espace ordinaire, qui casserait la ligne au mauvais endroit.
   */
  const attendus = servies.map(p => ({
    montant: Math.floor(p.price_cents / 100),
    devise: p.currency,
  }))

  const affiches = await page.locator('.offre__montant').allInnerTexts()

  const fautes = affiches.map((brut, i) => {
    const attendu = attendus[i]
    if (!attendu) return `« ${brut} » sans offre correspondante`
    if (!brut.includes(attendu.devise)) return `« ${brut} » sans sa devise ${attendu.devise}`
    if (attendu.montant >= 1000 && !brut.includes(' ')) return `« ${brut} » sans fine insécable`
    if (/\d \d/.test(brut)) return `« ${brut} » avec une espace ordinaire entre chiffres`
    return null
  }).filter(Boolean)

  note(
    'chaque prix porte sa devise, et la fine insécable dès les milliers',
    fautes.length === 0 && affiches.length > 0,
    fautes.length ? fautes.join(' · ') : `affichés : ${affiches.join(' · ')}`,
  )

  await page.screenshot({ path: `${SORTIE}-01-tarifs.png`, fullPage: true })
}

// ══════════ 2 bis. LES DEUX CHEMINS D'ARRIVÉE — M-009, pas 5 ═══
/*
 * UN MÊME COMPTE DOIT VOIR LE MÊME ÉCRAN, QU'IL OUVRE L'ADRESSE OU QU'IL VIENNE
 * D'UN ÉCRAN AUTHENTIFIÉ.
 *
 * `/tarifs` est une surface PUBLIQUE : rien n'y appelle `fetchMe()`, donc
 * `isAuthenticated` y est toujours faux au rendu SERVEUR. Une condition de
 * public qui s'appuierait dessus ne se serait vue qu'en navigation client — le
 * même candidat aurait donc trouvé deux écrans différents selon son chemin, et
 * le bouton aurait disparu sous son curseur après hydratation.
 *
 * Le rendu serveur reconnaît la session par le COOKIE entrant, le client par
 * `isAuthenticated` — `naja7i-session` étant `HttpOnly`, aucun des deux ne peut
 * emprunter la voie de l'autre. Ce cas mesure que les deux aboutissent au même
 * écran.
 *
 * CE QU'IL NE PROUVE PAS ENCORE, ET IL FAUT LE DIRE : le catalogue ne porte
 * qu'UNE catégorie de public, donc aucune offre n'est jamais « réservée à
 * quelqu'un d'autre » et les deux chemins rendent identiquement même si l'un
 * était aveugle. Il ne discriminera que le jour où une seconde catégorie
 * existera — c'est un filet posé d'avance, pas une preuve d'aujourd'hui. Ce qui
 * prouve la lecture serveur AUJOURD'HUI est `npm run publics`, et la mesure des
 * appels d'API rapportée au retour du pas 5.
 */
{
  const etat = async () => ({
    offres: await page.locator('.offre').count(),
    boutons: await page.locator('.offre .btn').count(),
    mentions: (await page.locator('.offre__public').allInnerTexts()).map(t => t.trim()),
    grises: await page.locator('.offre [disabled], .offre [aria-disabled="true"]').count(),
  })

  /* Chemin 1 — navigation CLIENT depuis un écran authentifié. */
  await page.goto(`${BASE}/fr/app/abonnement`, { waitUntil: 'networkidle' })
  await page.locator('a[href*="/tarifs"]').first().click()
  await page.waitForURL('**/tarifs**', { timeout: 20000 })
  await page.waitForSelector('.offre', { timeout: 15000 })
  const parNavigation = await etat()

  /* Chemin 2 — entrée DIRECTE sur l'adresse, donc rendu serveur, même session. */
  await page.goto(`${BASE}/fr/tarifs`, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.offre', { timeout: 15000 })
  const parAdresse = await etat()

  const memeEcran = JSON.stringify(parNavigation) === JSON.stringify(parAdresse)

  note(
    'les deux chemins d’arrivée sur /tarifs rendent le même écran',
    memeEcran && parNavigation.offres > 0,
    memeEcran
      ? `${parNavigation.offres} offre(s) · ${parNavigation.boutons} bouton(s) · `
        + `${parNavigation.mentions.length} mention(s) · identique par les deux chemins`
      : `navigation ${JSON.stringify(parNavigation)} ≠ adresse ${JSON.stringify(parAdresse)}`,
  )

  /* LA CONDITION NE GRISE JAMAIS. Un bouton désactivé reconstituerait le 403 en
   * français : soit l'action est proposée, soit elle n'existe pas dans le rendu. */
  note(
    'aucun bouton d’offre grisé, par l’un ou l’autre chemin',
    parNavigation.grises === 0 && parAdresse.grises === 0,
    `désactivés : ${parNavigation.grises} (navigation) · ${parAdresse.grises} (adresse)`,
  )
}

// ═══════════ 3. Le mur payant mène aux offres, sans bouton grisé ═══
let tentative = null
{
  tentative = await tentativeAvecCauseFermee()

  if (tentative === null) {
    note(
      'le mur payant mène aux offres',
      false,
      'aucune tentative de ce compte ne porte de cause fermée — rien à mesurer',
    )
  }
  else {
    await page.goto(`${BASE}/fr/app/tentative/${tentative.uuid}/correction`, { waitUntil: 'networkidle' })

    const mur = await page.locator('.mur').count()
    const versTarifs = await page.locator('.mur a[href*="/tarifs"]').count()
    const grises = await page.locator('.mur button[disabled], .mur [aria-disabled="true"]').count()

    note(
      'le mur payant invite vers les offres, sans bouton désactivé',
      mur === 1 && versTarifs === 1 && grises === 0,
      `mur affiché : ${mur} · lien vers /tarifs : ${versTarifs} · élément désactivé : ${grises}`,
    )

    await page.screenshot({ path: `${SORTIE}-02-mur.png`, fullPage: true })
  }
}

// ══════════ 4. Saisir un coupon : EN ATTENTE, et rien de plus ═══
let fermeesAvant = 0
{
  /* Le coupon est TIRÉ par le modèle, comme en back-office : un code écrit en
   * dur ici ferait passer la recette sur un chemin que rien n'emprunte, et le
   * jour où le générateur casse — il a déjà cassé — elle resterait verte. */
  const engendre = tinker('engendrer-coupon.php')
  const code = (engendre.sortie.match(/NJ7(?:-[A-Z2-9]{4}){3}/) ?? [])[0]

  note(
    'un coupon est tiré par le générateur du produit',
    engendre.code === 0 && Boolean(code),
    code ? `code : ${code}` : engendre.sortie.slice(-300),
  )

  if (code && tentative) {
    const avant = JSON.parse((await api(`/me/attempts/${tentative.uuid}/correction`)).corps)
    fermeesAvant = causeFermee(avant)

    /* CE QUE LE COMPTE PORTE DÉJÀ, lu AVANT la saisie. Voir la note plus bas :
     * « n'ouvre rien » est une comparaison, pas un compte à zéro. */
    const capacitesAvant = [...JSON.parse((await api('/me/subscription')).corps).data.capabilities]
      .sort()

    await page.goto(`${BASE}/fr/app/abonnement`, { waitUntil: 'networkidle' })
    await page.fill('#code-cadeau', code)
    await page.locator('.code button[type="submit"]').click()
    await page.locator('.attente').waitFor({ timeout: 10000 }).catch(() => {})

    const etat = JSON.parse((await api('/me/subscription')).corps).data
    const banniere = await page.locator('.attente').count()

    /*
     * ═══════════════════════════════════════════════════════════════════════
     * « N'OUVRE RIEN » EST UNE COMPARAISON, PAS UN COMPTE À ZÉRO — M-016
     *
     * Cette ligne exigeait `capabilities.length === 0`. Ce n'est pas ce que le
     * cas s'appelle : il dit qu'une commande EN ATTENTE n'ouvre RIEN DE PLUS.
     * Les deux phrases ne coïncident que sur un compte qui ne porte déjà rien.
     *
     * C'était le cas de l'ancien compte partagé, dont l'essai était clos depuis
     * longtemps — l'assertion encodait donc un palier qu'elle ne déclarait pas,
     * et c'est exactement le défaut que ce lot ferme. Sur le palier que ce
     * scénario DIT éprouver — l'essai — elle est fausse : un essai porte
     * `questions.answer`, et un vrai candidat qui saisit un coupon le garde.
     *
     * On compare donc l'avant et l'après. La formulation devient vraie sur
     * n'importe quel palier, et elle rougirait encore si une commande en
     * attente ouvrait quoi que ce soit.
     */
    const capacitesApres = [...etat.capabilities].sort()
    const ouvertesEnPlus = capacitesApres.filter(c => !capacitesAvant.includes(c))

    note(
      'saisir un coupon crée une commande EN ATTENTE, et n’ouvre RIEN DE PLUS',
      etat.pending_orders === 1 && ouvertesEnPlus.length === 0 && banniere === 1,
      `commandes en attente : ${etat.pending_orders}`
      + ` · capacités avant : ${capacitesAvant.join(', ') || 'aucune'}`
      + ` · ouvertes en plus : ${ouvertesEnPlus.join(', ') || 'aucune'}`
      + ` · bandeau « en cours de validation » : ${banniere}`,
    )

    /* LE CONTRÔLE QUI COMPTE : la cause est TOUJOURS fermée. */
    const apres = JSON.parse((await api(`/me/attempts/${tentative.uuid}/correction`)).corps)

    note(
      'la cause reste FERMÉE tant qu’un humain n’a pas validé',
      fermeesAvant > 0 && causeFermee(apres) === fermeesAvant,
      `lignes verrouillées avant la saisie : ${fermeesAvant} · après : ${causeFermee(apres)}`,
    )

    await page.screenshot({ path: `${SORTIE}-03-en-attente.png`, fullPage: true })
  }
}

// ═════════════ 5 et 6. L'équipe valide → la cause s'ouvre ═══
{
  const validation = tinker('valider-commande.php', { COMPTE_EMAIL: email })

  note(
    'l’équipe valide la commande par le chemin du back-office',
    validation.code === 0 && /honorée par/.test(validation.sortie),
    validation.code === 0
      ? validation.sortie.trim().split('\n').filter(Boolean).slice(-2).join(' · ')
      : validation.sortie.slice(-300),
  )

  const etat = JSON.parse((await api('/me/subscription')).corps).data

  note(
    'l’abonnement est actif et la file d’attente est vide',
    etat.capabilities.length > 0 && etat.pending_orders === 0,
    `capacités : ${etat.capabilities.join(', ') || 'aucune'} · en attente : ${etat.pending_orders}`,
  )

  if (tentative) {
    const apres = JSON.parse((await api(`/me/attempts/${tentative.uuid}/correction`)).corps)

    note(
      'la cause est OUVERTE après validation — le mur est tombé',
      fermeesAvant > 0 && causeFermee(apres) === 0 && apres.meta.cause_quota.unlimited === true,
      `verrouillées avant : ${fermeesAvant} · après validation : ${causeFermee(apres)}`
      + ` · quota illimité : ${apres.meta.cause_quota.unlimited}`,
    )

    /* Et à l'écran : le mur a disparu, il n'est pas seulement vide. */
    await page.goto(`${BASE}/fr/app/tentative/${tentative.uuid}/correction`, { waitUntil: 'networkidle' })

    note(
      'le mur a disparu du rendu, il n’est pas resté en coquille vide',
      (await page.locator('.mur').count()) === 0,
      `blocs « mur » à l’écran : ${await page.locator('.mur').count()}`,
    )
  }

  await page.goto(`${BASE}/fr/app/abonnement`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${SORTIE}-04-abonne.png`, fullPage: true })
}

// ══════════════════════════════ 7. RTL et dir sur l'arabe ═══
{
  await page.goto(`${BASE}/ar/tarifs`, { waitUntil: 'networkidle' })

  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))

  /* Les chaînes d'API — nom et description de l'offre — portent `dir="auto"` :
   * un nom d'offre saisi en français dans un back-office arabe se rendrait
   * sinon à l'envers. */
  const sansDir = await page.evaluate(
    () => [...document.querySelectorAll('.offre__nom, .offre__texte')]
      .filter(e => e.getAttribute('dir') !== 'auto').length,
  )

  /* Aucun chiffre arabo-indien sur un prix : le catalogue est en chiffres
   * latins partout, et `prixEnClair` s'appuie sur `nombre()` pour cela. */
  const prixArabe = await page.locator('.offre__montant').allInnerTexts()
  const indiens = prixArabe.filter(p => /[٠-٩۰-۹]/.test(p))

  note(
    'RTL complet, dir="auto" sur les chaînes d’API, chiffres latins sur les prix',
    dir === 'rtl' && sansDir === 0 && indiens.length === 0,
    `dir=${dir} · ${sansDir} chaîne(s) d’API sans dir="auto" · `
    + `prix en chiffres arabo-indiens : ${indiens.length}`,
  )

  await page.screenshot({ path: `${SORTIE}-05-tarifs-arabe.png`, fullPage: true })
}

// ══════════════ 8. Audit de rendu des deux écrans du lot ═══
{
  /*
   * `/tarifs` est public mais lit l'API, et `/app/abonnement` demande une
   * session : ni l'un ni l'autre n'entre dans la passe d'`npm run audit:ci`,
   * qui tourne sans backend. Les auditer ICI est le seul endroit où ils
   * existent vraiment — avec leurs offres, leurs prix et leur état.
   *
   * Contraste, débordement et cibles tactiles, dans un vrai navigateur : les
   * mêmes règles que partout, mesurées et non supposées.
   */
  const cookies = await contexte.cookies()
  writeFileSync(`${SORTIE}-cookies.json`, JSON.stringify(cookies, null, 2))

  const ECRANS = [['tarifs', '/tarifs'], ['abonnement', '/app/abonnement']]
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
    'audit de rendu — deux écrans × 1440/390 × FR/AR × clair/sombre',
    enEchec.length === 0,
    enEchec.length ? `anomalies graves : ${enEchec.join(', ')}` : '8 passes, aucune anomalie grave',
  )
}

await navigateur.close()

const mesures = resultats.filter(r => r.ok !== null)
const echecs = mesures.filter(r => !r.ok)
const nonMesures = resultats.filter(r => r.ok === null)

writeFileSync(`${SORTIE}.json`, JSON.stringify(resultats, null, 2))

console.log(`\n── ${mesures.length - echecs.length}/${mesures.length} cas conformes`
  + `${nonMesures.length ? ` · ${nonMesures.length} non mesuré(s)` : ''} ──`)

process.exit(echecs.length === 0 ? 0 : 1)
