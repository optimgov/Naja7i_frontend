#!/usr/bin/env node
/**
 * recette-zone-publique.mjs — la zone publique v1, cas par cas.
 *
 *   node scripts/recette-zone-publique.mjs [baseUrl]
 *
 * Ce que cette recette éprouve, et pourquoi c'est celle-là :
 *
 *   1. LA 301 de `/calendrier` — arbitrage A3. Une 302 garderait l'ancienne
 *      adresse indexée ; le contrôle porte donc sur le CODE, pas seulement sur
 *      la destination.
 *   2. LES FILTRES DANS L'URL — rechargée, une adresse filtrée doit rendre le
 *      MÊME écran. Sans quoi rien n'est partageable ni indexable, et c'est tout
 *      l'intérêt de les avoir mis là.
 *   3. LE JSON-LD, présent dans le HTML SERVI (pas après hydratation) et
 *      portant un `validThrough` EXACT — c'est ce champ qui fait sortir une
 *      annonce des résultats le jour venu.
 *   4. LA PASTILLE VIVANTE — le compteur de l'en-tête doit valoir le nombre
 *      d'annonces réellement ouvertes aujourd'hui, pas le champ figé à la
 *      collecte.
 *   5. LE BUDGET DE SURFACE A2, mesuré et RAPPORTÉ. Voir la note du cas.
 */

import { writeFileSync } from 'node:fs'

import { chromium } from 'playwright'

import { joursRestants } from '../server/utils/echeance.ts'

const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000'
const SORTIE = process.env.SORTIE || '/tmp/recette-zone-publique'

const resultats = []
const note = (cas, ok, constate) => {
  resultats.push({ cas, ok, constate })
  console.log(`${ok ? '  ok  ' : '  ✗   '}${cas}\n        ${constate}`)
}

const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } })
const page = await contexte.newPage()

// ════════════════════════════════════ 1. La 301 de /calendrier (A3) ═══
{
  for (const [chemin, attendu] of [
    ['/calendrier', '/opportunites'],
    ['/fr/calendrier', '/fr/opportunites'],
    ['/ar/calendrier', '/ar/opportunites'],
  ]) {
    const r = await fetch(`${BASE}${chemin}`, { redirect: 'manual' })
    const cible = r.headers.get('location') ?? ''

    note(
      `A3 — ${chemin} redirige en 301 vers ${attendu}`,
      r.status === 301 && cible === attendu,
      `${r.status} → ${cible || '—'}`,
    )
  }

  /* La chaîne de requête ne doit pas se perdre en route. */
  const r = await fetch(`${BASE}/fr/calendrier?filiere=education`, { redirect: 'manual' })
  note(
    'A3 — la redirection conserve les filtres',
    (r.headers.get('location') ?? '').includes('filiere=education'),
    `→ ${r.headers.get('location') ?? '—'}`,
  )
}

// ═══════════════════════════ 2. Les filtres vivent dans l'URL ═══
{
  await page.goto(`${BASE}/fr/opportunites`, { waitUntil: 'networkidle' })
  const total = Number((await page.locator('.tapis__compte').innerText()).replace(/\D/g, ''))

  /* On coche un filtre à l'écran, et l'URL doit CHANGER. */
  await page.locator('.rail__groupe').first().locator('input[type="checkbox"]').first().check()
  await page.waitForTimeout(400)

  const url = new URL(page.url())
  const filtre = url.searchParams.get('filiere')
  const apres = Number((await page.locator('.tapis__compte').innerText()).replace(/\D/g, ''))

  note(
    'les filtres s’écrivent dans l’URL',
    filtre !== null && apres < total,
    `?filiere=${filtre ?? '—'} · ${total} annonces → ${apres}`,
  )

  /* LE CONTRÔLE QUI COMPTE : on RECHARGE l'URL filtrée dans un onglet neuf.
   * C'est ce que fait un candidat à qui on a envoyé le lien. */
  const vierge = await contexte.newPage()
  await vierge.goto(page.url(), { waitUntil: 'networkidle' })
  const rechargee = Number((await vierge.locator('.tapis__compte').innerText()).replace(/\D/g, ''))
  const coche = await vierge.locator('.rail__groupe').first()
    .locator('input[type="checkbox"]').first().isChecked()

  note(
    'une URL filtrée rechargée rend le MÊME écran',
    rechargee === apres && coche,
    `${rechargee} annonces (attendu ${apres}) · case rétablie : ${coche}`,
  )
  await vierge.close()

  /* Les trois vues, et « par échéance » par défaut. */
  await page.goto(`${BASE}/fr/opportunites`, { waitUntil: 'networkidle' })
  const defaut = await page.locator('.vue[aria-pressed="true"]').innerText()
  const paliers = await page.locator('.tapis__palier').count()

  note(
    'la vue par défaut est « par échéance », en paliers nommés',
    /échéance/i.test(defaut) && paliers > 0,
    `vue active : « ${defaut.trim()} » · ${paliers} palier(s) nommé(s)`,
  )

  await page.goto(`${BASE}/fr/opportunites?vue=filiere`, { waitUntil: 'networkidle' })
  const parFiliere = await page.locator('.vue[aria-pressed="true"]').innerText()
  note(
    'la vue se lit depuis l’URL',
    /filière/i.test(parFiliere),
    `?vue=filiere → « ${parFiliere.trim()} »`,
  )

  await page.screenshot({ path: `${SORTIE}-01-tapis.png`, fullPage: true })
}

// ═══════════════════════ 3. La fiche : SSR, JSON-LD, validThrough ═══
{
  await page.goto(`${BASE}/fr/opportunites`, { waitUntil: 'networkidle' })
  const href = await page.locator('.annonce__titre a').first().getAttribute('href')

  /* On lit le HTML SERVI, sans navigateur : c'est ce que voit un collecteur de
   * données structurées, et c'est là que le JSON-LD doit être. */
  const html = await fetch(`${BASE}${href}`).then(r => r.text())
  const bloc = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)

  let ld = null
  try { ld = bloc ? JSON.parse(bloc[1]) : null } catch { /* invalide */ }

  note(
    'JSON-LD JobPosting présent dans le HTML SERVI',
    ld?.['@type'] === 'JobPosting',
    bloc ? `@type = ${ld?.['@type'] ?? 'illisible'}` : 'aucun bloc ld+json dans la réponse serveur',
  )

  /* `validThrough` doit être l'échéance EXACTE de l'annonce, horaire compris. */
  const donnees = await fetch(`${BASE}/_donnees/opportunites`).then(r => r.json())
  const slug = decodeURIComponent((href ?? '').split('/').pop() ?? '')
  const source = donnees.data.find(x => x.slug === slug)

  note(
    'validThrough porte l’échéance exacte de la source',
    ld?.validThrough === source?.deadline,
    `JSON-LD : ${ld?.validThrough ?? '—'} · source : ${source?.deadline ?? '—'}`,
  )

  note(
    'l’organisme recruteur est l’administration, jamais naja7i',
    ld?.hiringOrganization?.name === source?.org,
    `hiringOrganization = ${ld?.hiringOrganization?.name ?? '—'}`,
  )

  await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' })

  note(
    'la fiche porte l’historique des révisions et le bloc source',
    (await page.locator('.revision').count()) >= 2 && (await page.locator('.source').count()) === 1,
    `${await page.locator('.revision').count()} révision(s) · bloc source : ${await page.locator('.source').count()}`,
  )

  const texte = await page.locator('main').innerText()
  note(
    'seul l’avis officiel fait foi — la page le dit',
    /avis officiel/i.test(texte),
    `mention présente : ${/avis officiel/i.test(texte)}`,
  )

  await page.screenshot({ path: `${SORTIE}-02-fiche.png`, fullPage: true })

  /*
   * ══════ LA CONFIANCE EST AU-DESSUS DU CORPS, DANS LE DOM ══════
   *
   * Le contrôle porte sur l'ORDRE DU DOCUMENT, pas sur les coordonnées à
   * l'écran : un `order` CSS aurait déplacé le bloc pour l'œil et laissé le
   * lecteur d'écran dans l'ordre d'origine. `compareDocumentPosition` mesure
   * exactement ce qui a été corrigé.
   *
   * La mesure de défilement vient EN PLUS, à 390 px : elle dit ce que le
   * candidat vit vraiment, et c'est elle qui avait motivé le déplacement.
   */
  const ordre = await page.evaluate(() => {
    const cote = document.querySelector('.fiche__cote')
    const corps = document.querySelector('.fiche__corps')
    if (!cote || !corps) return null
    // eslint-disable-next-line no-bitwise
    return Boolean(cote.compareDocumentPosition(corps) & Node.DOCUMENT_POSITION_FOLLOWING)
  })

  note(
    'la carte de confiance précède le corps dans l’ordre du document',
    ordre === true,
    ordre === null
      ? 'régions introuvables : .fiche__cote ou .fiche__corps absent'
      : `.fiche__cote avant .fiche__corps : ${ordre}`,
  )

  {
    /* À 390 px, où commence la carte de confiance ? En pixels depuis le haut du
       document — c'est-à-dire ce qu'il faut faire défiler pour la voir. */
    const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 } })
    const p = await ctx.newPage()
    await p.goto(`${BASE}${href}`, { waitUntil: 'networkidle' })

    const mesure = await p.evaluate(() => {
      const cote = document.querySelector('.fiche__cote')
      if (!cote) return null
      const haut = cote.getBoundingClientRect().top + window.scrollY
      return { haut, ecran: window.innerHeight, page: document.documentElement.scrollHeight }
    })
    await ctx.close()

    /* UN ÉCRAN ET DEMI : le titre, l'organisme et le rattachement passent
       d'abord, ce qui est voulu — la carte ne doit pas ouvrir la page sur des
       boutons dont on ignore le sujet. Au-delà, on est de nouveau en train
       d'enterrer la seule chose pour laquelle le candidat est venu. */
    const plafond = mesure ? mesure.ecran * 1.5 : 0

    note(
      'à 390 px, la confiance est atteinte sans défilement important',
      Boolean(mesure) && mesure.haut < plafond,
      mesure
        ? `carte à ${Math.round(mesure.haut)} px du haut · écran ${mesure.ecran} px `
          + `· plafond ${Math.round(plafond)} px · page ${mesure.page} px`
        : 'carte introuvable',
    )
  }

  /*
   * ══════ LE PARTAGE WHATSAPP ══════
   *
   * Trois choses, et chacune a sa raison :
   *   - le message porte l'URL CANONIQUE, pas `window.location` — qui n'existe
   *     pas au rendu serveur et enverrait `localhost` depuis un poste de recette ;
   *   - il est LOCALISÉ, donc il diffère entre `/fr` et `/ar` ;
   *   - le lien porte `noopener noreferrer` et un libellé ÉCRIT.
   */
  const partage = await page.locator('.action__partage')
  const lien = await partage.getAttribute('href') ?? ''
  const rel = await partage.getAttribute('rel') ?? ''
  const cible = await partage.getAttribute('target') ?? ''
  const libellePartage = (await partage.innerText()).trim()

  const message = decodeURIComponent(lien.split('text=')[1] ?? '')
  const urlDansMessage = message.split('\n').find(l => l.startsWith('http')) ?? ''
  const slugFiche = decodeURIComponent((href ?? '').split('/').pop() ?? '')

  note(
    'le message WhatsApp contient l’URL canonique de la fiche',
    lien.startsWith('https://wa.me/?text=')
    && /^https?:\/\/[^/]+\/fr\/opportunites\//.test(urlDansMessage)
    && message.includes(slugFiche),
    `lien : ${lien.slice(0, 60)}… · URL trouvée dans le message : ${urlDansMessage || 'AUCUNE'}`,
  )

  note(
    'le lien de partage s’ouvre à part, sans donner la main sur notre page',
    cible === '_blank' && rel.includes('noopener') && rel.includes('noreferrer')
    && libellePartage.length > 3,
    `target=${cible || '—'} · rel=${rel || '—'} · libellé écrit : « ${libellePartage} »`,
  )

  /* LOCALISÉ : la même fiche en arabe doit produire un AUTRE message. */
  await page.goto(`${BASE}${(href ?? '').replace('/fr/', '/ar/')}`, { waitUntil: 'networkidle' })
  const lienAr = await page.locator('.action__partage').getAttribute('href') ?? ''
  const messageAr = decodeURIComponent(lienAr.split('text=')[1] ?? '')

  note(
    'le message de partage est localisé',
    messageAr.length > 0 && messageAr !== message && messageAr.includes('/ar/opportunites/'),
    `fr ≠ ar : ${messageAr !== message} · l’URL arabe pointe la version arabe : `
    + `${messageAr.includes('/ar/opportunites/')}`,
  )

  /* Un slug inconnu répond 404 côté SERVEUR : une page vide en 200 se ferait
   * indexer comme une fiche valide. */
  const inconnu = await fetch(`${BASE}/fr/opportunites/slug-qui-n-existe-pas`)
  note('un slug inconnu répond 404', inconnu.status === 404, `HTTP ${inconnu.status}`)
}

// ══════════════════════════════ 4. La pastille est vivante (A1) ═══
{
  const donnees = await fetch(`${BASE}/_donnees/opportunites`).then(r => r.json())

  /*
   * ON RECALCULE DEPUIS `deadline`, PAS DEPUIS `jours` — audit t4, BLOC-ZP1-1.
   *
   * Ce contrôle lisait `a.jours`, c'est-à-dire le champ que le serveur venait
   * de calculer. Les deux côtés de la comparaison sortaient donc de la même
   * source : quand ce calcul s'est révélé faux — dates civiles UTC, une annonce
   * close à 16h30 encore ouverte à 16h31 — la recette est restée VERTE. Elle ne
   * mesurait pas l'ouverture des annonces, elle mesurait l'égalité d'un champ
   * avec lui-même.
   *
   * `joursRestants` est la fonction du produit, éprouvée aux frontières de
   * journée par `scripts/verifier-echeances.mjs` avec une horloge injectable.
   * L'utiliser ici n'est pas une seconde vérité : c'est la même, appliquée à
   * `deadline` — la donnée qui ne périme pas — au lieu de son résultat servi.
   */
  const fuseau = donnees.meta.timezone_candidat
  const ouvertes = donnees.data.filter(
    a => a.stage === 'annonce' && (joursRestants(a.deadline, new Date(), fuseau) ?? -1) >= 0,
  ).length

  note(
    'le serveur DIT quelle horloge il a employée',
    typeof fuseau === 'string' && fuseau.length > 0,
    `meta.timezone_candidat = ${fuseau ?? 'absent'}`,
  )

  /* Et le champ servi doit coïncider avec le recalcul, annonce par annonce :
   * sans ce contrôle, la route pourrait cesser d'appliquer la fonction sans que
   * rien ne le dise. */
  const divergentes = donnees.data.filter(
    a => a.jours !== joursRestants(a.deadline, new Date(), fuseau),
  )

  note(
    'le champ `jours` servi est bien le recalcul, annonce par annonce',
    divergentes.length === 0,
    divergentes.length === 0
      ? `${donnees.data.length} annonce(s) vérifiée(s)`
      : `${divergentes.length} divergence(s), dont « ${divergentes[0].slug} » : `
        + `servi ${divergentes[0].jours}, recalculé ${joursRestants(divergentes[0].deadline, new Date(), fuseau)}`,
  )

  await page.goto(`${BASE}/fr`, { waitUntil: 'networkidle' })
  const pastille = Number((await page.locator('.nav__compteur').first().innerText()).trim())

  note(
    'A1 — la pastille compte les annonces réellement ouvertes aujourd’hui',
    pastille === ouvertes,
    `pastille ${pastille} · ouvertes recalculées depuis deadline ${ouvertes} `
    + `(le champ figé du 8 août en annonçait 26)`,
  )

  const marqueur = await page.locator('.fil-actu__fixture').count()
  note(
    'la mention de fixture vient du serveur et est affichée',
    marqueur === 1 && donnees.meta.fixture === true,
    `meta.fixture = ${donnees.meta.fixture} · mention rendue : ${marqueur}`,
  )
}

// ═══ 4 bis. Aucune promesse de candidature sur un dépôt clos ═══
{
  /*
   * LE DÉFAUT, TROUVÉ EN RECETTE LOCALE : `rattachementDe()` ne lisait que
   * `has_prep` et `prep_slug`. `estOuverte()` était quatre lignes plus bas dans
   * le même fichier, jamais consultée. Une annonce dont le dépôt est CLOS
   * affichait « ✓ naja7i prépare ce concours » avec un lien actif — comme si
   * l'on pouvait encore candidater.
   *
   * LA CORRECTION N'EST PAS DE MASQUER LE LIEN. Se préparer reste légitime
   * quand le dépôt de cette session est clos ; c'est la PHRASE qui mentait, pas
   * le chemin. Un quatrième état le dit.
   *
   * ON NE FABRIQUE RIEN : la fixture du 8 août porte les deux cas, et c'est
   * elle qui décide. Si elle change et n'en porte plus, ce contrôle le DIT au
   * lieu de passer sur un ensemble vide.
   */
  const donnees = await fetch(`${BASE}/_donnees/opportunites`).then(r => r.json())
  const fuseau = donnees.meta.timezone_candidat

  const ouverte = a => a.stage === 'annonce'
    && (joursRestants(a.deadline, new Date(), fuseau) ?? -1) >= 0

  const closesAvecPrep = donnees.data.filter(
    a => a.naja7i?.has_prep && a.naja7i?.prep_slug && !ouverte(a),
  )

  note(
    'la fixture porte bien des annonces PRÉPARÉES dont le dépôt est clos',
    closesAvecPrep.length > 0,
    closesAvecPrep.length
      ? `${closesAvecPrep.length} cas : ${closesAvecPrep.map(a => `${a.titre.slice(0, 34)} (${a.stage})`).join(' · ')}`
      : 'AUCUN — ce contrôle ne mesure plus rien, la fixture a changé',
  )

  const anomalies = []
  const liensGardes = []

  for (const annonce of closesAvecPrep) {
    await page.goto(`${BASE}/fr/opportunites/${annonce.slug}`, { waitUntil: 'networkidle' })

    const texte = (await page.locator('main').innerText()) ?? ''

    /* La phrase qui promet une candidature ne doit PAS être là… */
    const promet = /naja7i prépare ce concours(?!\s*·)/.test(texte)
      || texte.includes('Une préparation existe pour ce concours')
        && !texte.includes('dépôt de cette session est clos')

    /* …et le chemin vers la préparation doit RESTER. */
    const lien = await page.locator(`a[href*="/concours/famille/${annonce.naja7i.prep_slug}"]`).count()

    if (promet) anomalies.push(`${annonce.slug} promet une candidature`)
    liensGardes.push(`${annonce.slug} : ${lien} lien(s)`)
  }

  note(
    'aucune annonce close ne promet de candidature — et son lien de préparation RESTE',
    anomalies.length === 0 && liensGardes.every(l => !l.endsWith(': 0 lien(s)')),
    anomalies.length
      ? `ANOMALIES : ${anomalies.join(' · ')}`
      : `${closesAvecPrep.length} fiche(s) close(s) vérifiée(s) · ${liensGardes.join(' · ')}`,
  )

  /* ET LE CAS OUVERT CONTINUE D'INVITER : sans ce contrôle, tout masquer
   * passerait pour une correction. */
  const ouvertesAvecPrep = donnees.data.filter(
    a => a.naja7i?.has_prep && a.naja7i?.prep_slug && ouverte(a),
  )

  let inviteEncore = 0

  for (const annonce of ouvertesAvecPrep.slice(0, 2)) {
    await page.goto(`${BASE}/fr/opportunites/${annonce.slug}`, { waitUntil: 'networkidle' })
    const texte = (await page.locator('main').innerText()) ?? ''
    if (texte.includes('Une préparation existe') && !texte.includes('dépôt de cette session est clos')) {
      inviteEncore += 1
    }
  }

  note(
    'une annonce OUVERTE invite toujours, sans mention de clôture',
    ouvertesAvecPrep.length > 0 && inviteEncore === Math.min(2, ouvertesAvecPrep.length),
    `${ouvertesAvecPrep.length} annonce(s) ouverte(s) avec préparation · `
    + `${inviteEncore} invite(nt) sans mention de clôture`,
  )
}

// ═════════════════════════ 5. Le budget de surface A2, mesuré ═══
{
  const mesures = {}
  for (const largeur of [1440, 390]) {
    const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 900 } })
    const p = await ctx.newPage()
    await p.goto(`${BASE}/fr`, { waitUntil: 'networkidle' })

    mesures[largeur] = await p.evaluate(() => {
      const h = sel => document.querySelector(sel)?.getBoundingClientRect().height ?? 0
      const total = document.documentElement.scrollHeight
      const bandeau = h('.bandeau-echeance')
      const fil = h('.fil-actu')
      /* `fil` est rendu SÉPARÉMENT du ratio : une section absente donne 0 %, un
         chiffre excellent qui ne mesure rien. Voir le contrôle ci-dessous. */
      return { total, bandeau, fil, part: ((bandeau + fil) / total) * 100 }
    })
    await ctx.close()
  }

  /*
   * ═══════════════ LE SEUIL DE 22 % EST DÉSORMAIS BLOQUANT ═══════════════
   *
   * CE QU'IL ÉTAIT. « A2 exige moins de 22 %, la maquette de référence est à
   * 32,5 % » : les deux moitiés de l'arbitrage — « six cartes » et « moins de
   * 22 % » — étaient arithmétiquement incompatibles. La mesure était donc
   * RAPPORTÉE, avec une garde à 60 % qui n'arrêtait rien, et un commentaire qui
   * laissait l'arbitrage ouvert. Le fil mesurait 34,4 % à 1440 px et 37,0 % à
   * 390 px : l'accueil était un tableau d'affichage, et la recette le disait
   * en vert.
   *
   * CE QUI A CHANGÉ, ET DANS QUEL ORDRE. Le seuil ne devient bloquant qu'APRÈS
   * la réduction, et dans le même lot : l'activer avant aurait rendu la recette
   * rouge entre deux commits, sur un défaut qu'on était en train de corriger.
   * Une recette rouge par construction ne se lit plus.
   *
   * Les six cartes sont remplacées par TROIS LIGNES d'échéance — un autre
   * objet, pas une carte comprimée. Le tapis complet reste à un clic.
   *
   * CE QUE LE CONTRÔLE MESURE VRAIMENT. `.bandeau-echeance` ne s'affiche que
   * s'il y a une urgence : sa hauteur peut valoir zéro sans que rien n'aille
   * mal. `.fil-actu` disparaît si aucune annonce n'est ouverte. On vérifie donc
   * AUSSI que la section a bien été trouvée — sinon un accueil dont le fil a
   * disparu rendrait 0 % et passerait pour exemplaire.
   */
  const PLAFOND = 22

  const pire = Math.max(mesures[1440].part, mesures[390].part)
  const filTrouve = mesures[1440].fil > 0 && mesures[390].fil > 0

  note(
    'A2 — le fil des annonces reste présent sur l’accueil',
    filTrouve,
    `hauteur de .fil-actu — 1440 px : ${Math.round(mesures[1440].fil)} px · `
    + `390 px : ${Math.round(mesures[390].fil)} px`
    + (filTrouve ? '' : ' — ABSENT : la mesure de surface ci-dessous ne vaut rien'),
  )

  note(
    `A2 — surface des annonces sur l’accueil sous ${PLAFOND} %`,
    filTrouve && pire < PLAFOND,
    `1440 px : ${mesures[1440].part.toFixed(1)} % · 390 px : ${mesures[390].part.toFixed(1)} % `
    + `— plafond ${PLAFOND} % (le fil de six cartes mesurait 34,4 % et 37,0 %)`,
  )
}

// ══════════════ 5 bis. La barre basse : cinq cibles, 320 et 390 px ═══
{
  /*
   * L'ARBITRAGE EST PASSÉ DE QUATRE À CINQ ENTRÉES, ET IL SE MESURE.
   *
   * `BarreBasse.vue` documentait quatre entrées avec ce motif : « une cinquième
   * aurait ramené chaque cible sous le seuil tactile de 44 px à 320 px de
   * large ». L'arithmétique disait autre chose — 320 / 5 = 64 px. Le raisonnement
   * était faux, et il tenait lieu de mesure depuis le lot ZP-1.
   *
   * Le risque RÉEL n'est pas la cible mais le LIBELLÉ : « Opportunités » est un
   * mot de douze caractères sans espace, et il ne se coupe pas tout seul. On
   * mesure donc les deux, aux deux largeurs et dans les deux langues — l'arabe
   * n'a ni les mêmes longueurs ni la même police.
   */
  const CIBLE_MIN = 48
  const anomalies = []
  const releve = []

  for (const largeur of [320, 390]) {
    for (const langue of ['fr', 'ar']) {
      const ctx = await navigateur.newContext({ viewport: { width: largeur, height: 800 } })
      const p = await ctx.newPage()
      await p.goto(`${BASE}/${langue}`, { waitUntil: 'networkidle' })

      const mesure = await p.evaluate(() => {
        const liens = [...document.querySelectorAll('.barre-basse__lien')]
        return liens.map((lien) => {
          const r = lien.getBoundingClientRect()
          const mot = lien.querySelector('.barre-basse__mot')
          return {
            texte: (mot?.textContent || '').trim(),
            largeur: r.width,
            hauteur: r.height,
            /* Le libellé DÉBORDE-T-IL de sa colonne ? `scrollWidth` dépasse
               `clientWidth` quand un mot insécable ne tient pas. */
            deborde: mot ? mot.scrollWidth > mot.clientWidth + 1 : false,
          }
        })
      })
      await ctx.close()

      const ou = `${largeur} px · ${langue}`

      if (mesure.length !== 5) {
        anomalies.push(`${ou} : ${mesure.length} entrée(s) au lieu de 5`)
        continue
      }

      for (const cible of mesure) {
        if (cible.largeur < CIBLE_MIN || cible.hauteur < CIBLE_MIN) {
          anomalies.push(
            `${ou} : « ${cible.texte} » ${Math.round(cible.largeur)}×${Math.round(cible.hauteur)}`,
          )
        }
        if (cible.deborde) anomalies.push(`${ou} : « ${cible.texte} » déborde de sa colonne`)
      }

      const plusPetite = mesure.reduce((a, b) => (a.largeur * a.hauteur <= b.largeur * b.hauteur ? a : b))
      releve.push(
        `${ou} : ${Math.round(plusPetite.largeur)}×${Math.round(plusPetite.hauteur)} au minimum`,
      )
    }
  }

  note(
    `la barre basse porte cinq cibles d’au moins ${CIBLE_MIN} px, libellés compris`,
    anomalies.length === 0,
    anomalies.length ? `ANOMALIES : ${anomalies.join(' · ')}` : releve.join(' · '),
  )
}

// ═══════════════ 5 ter. La démonstration se JOUE, et ne fuit pas ═══
{
  /*
   * ═══════════════════════════════════════════════════════════════════════
   * CE QUE CE CAS EMPÊCHE DE REVENIR
   *
   * La démonstration révélait la bonne réponse d'emblée : un visiteur lisait un
   * corrigé sans avoir rien tenté, sur le bloc qui porte la promesse
   * « comprendre ses erreurs ». Comprendre une erreur suppose une erreur, donc
   * un choix, donc un moment où l'on ne sait pas encore.
   *
   * LE CONTRÔLE PORTE SUR L'ARBRE, PAS SUR L'ŒIL. Masquer la correction en CSS
   * aurait produit la même capture et un tout autre produit : le bloc serait
   * resté dans l'arbre d'accessibilité, un lecteur d'écran aurait annoncé la
   * bonne réponse avant le choix, et la tabulation l'aurait traversée. On
   * vérifie donc l'ABSENCE des nœuds, pas leur invisibilité.
   *
   * IL EST JOUÉ EN FRANÇAIS. `semer-banque.mjs` sème une banque française ;
   * l'arabe est relevé à part, en information, parce qu'une banque sans
   * question arabe n'est pas un défaut de cette interface — et parce que le
   * taire laisserait croire que la démonstration arabe fonctionne.
   */
  await page.goto(`${BASE}/fr`, { waitUntil: 'networkidle' })

  const vide = await page.locator('.preuve--vide').count()

  if (vide > 0) {
    note(
      'la démonstration est servie sur l’accueil',
      false,
      'le bloc rend son état de repli : la banque de recette ne porte aucune question '
      + 'française éligible au diagnostic, et les cas suivants ne mesurent rien',
    )
  } else {
    note('la démonstration est servie sur l’accueil', true, 'bloc de preuve rendu')

    /* ── D1. Rien de la correction n'existe AVANT le choix ── */
    const fuites = await page.evaluate(() => ({
      justifications: document.querySelectorAll('.preuve__justification').length,
      marques: document.querySelectorAll('.preuve__marque').length,
      verdict: document.querySelectorAll('.preuve__verdict').length,
      juste: document.querySelectorAll('.preuve__option--juste').length,
    }))

    const total = Object.values(fuites).reduce((a, b) => a + b, 0)

    note(
      'avant validation, la correction n’est pas dans l’arbre du document',
      total === 0,
      total === 0
        ? 'aucun nœud de correction rendu — ni justification, ni marque, ni verdict'
        : `FUITE : ${JSON.stringify(fuites)}`,
    )

    /* ── D2. Sans choix, la validation est indisponible ET dit pourquoi ── */
    const bouton = page.locator('.preuve__valider')
    const avant = await bouton.getAttribute('aria-disabled')
    const decrit = await bouton.getAttribute('aria-describedby')
    const raison = decrit ? await page.locator(`#${decrit}`).innerText() : ''

    note(
      'sans réponse choisie, la validation est annoncée indisponible avec sa raison',
      avant === 'true' && Boolean(decrit) && raison.trim().length > 0,
      `aria-disabled=${avant} · aria-describedby=${decrit ?? '—'} · raison : « ${raison.trim()} »`,
    )

    /* ── D3. Un choix rend la validation disponible ── */
    await page.locator('.preuve__radio').first().check()
    await page.waitForTimeout(150)
    const apres = await bouton.getAttribute('aria-disabled')

    note(
      'une réponse choisie rend la validation disponible',
      apres === 'false',
      `aria-disabled=${apres}`,
    )

    /* ── D4. La correction paraît, ENTIÈRE ── */
    await bouton.click()
    await page.waitForTimeout(300)

    const apresValidation = await page.evaluate(() => {
      const options = document.querySelectorAll('.preuve__option').length
      const justifications = document.querySelectorAll('.preuve__justification').length
      const corps = document.querySelector('.preuve__correction')
      return {
        options,
        justifications,
        verdict: (document.querySelector('.preuve__verdict')?.textContent || '').trim(),
        bonne: document.querySelectorAll('.preuve__option--juste').length,
        choisie: document.querySelectorAll('.preuve__option--choisie').length,
        assise: (document.querySelector('.preuve__assise')?.textContent || '').trim(),
        actes: document.querySelectorAll('.preuve__actes a').length,
        /* Un score se reconnaît à un pourcentage ou à un « n sur m ». */
        score: /\d+\s*%|\b\d+\s*(sur|\/)\s*\d+\b/.test(corps?.textContent || ''),
      }
    })

    note(
      'après validation, CHAQUE option reçoit sa justification',
      apresValidation.options > 0
      && apresValidation.justifications === apresValidation.options,
      `${apresValidation.justifications} justification(s) pour ${apresValidation.options} option(s)`,
    )

    note(
      'la bonne réponse et la réponse choisie sont marquées, et le verdict est ÉCRIT',
      apresValidation.bonne === 1 && apresValidation.choisie === 1
      && apresValidation.verdict.length > 0,
      `bonne : ${apresValidation.bonne} · choisie : ${apresValidation.choisie} · `
      + `verdict : « ${apresValidation.verdict} »`,
    )

    note(
      'aucun score n’est produit, et la phrase le dit',
      !apresValidation.score && apresValidation.assise.length > 0,
      apresValidation.score
        ? 'un nombre ressemblant à un score apparaît dans la correction'
        : `« ${apresValidation.assise} »`,
    )

    /*
     * L'ACTION SUIVANTE NE DÉPEND PAS DE LA REMÉDIATION. Le contrat sert
     * `remediation: null` sur toute question qui n'en porte pas ; le chemin vers
     * la suite ne doit pas s'évanouir avec elle.
     */
    const remede = await page.locator('.preuve__remede').count()

    note(
      'l’action suivante existe, que la remédiation soit servie ou non',
      apresValidation.actes >= 1,
      `${apresValidation.actes} action(s) après la correction · remédiation servie : ${remede === 1}`,
    )

    await page.screenshot({ path: `${SORTIE}-04-demonstration.png`, fullPage: true })
  }

  /* L'ARABE EST RELEVÉ, PAS EXIGÉ. Le contrôleur filtre la banque sur
   * `where('locale', $locale)` : une banque sans question arabe rend 404
   * `DEMO_NOT_AVAILABLE`, et l'écran affiche honnêtement son repli. Ce n'est pas
   * un défaut d'interface — c'est un état du contenu, et il doit se voir. */
  await page.goto(`${BASE}/ar`, { waitUntil: 'networkidle' })
  const videAr = await page.locator('.preuve--vide').count()

  console.log(
    `  info  démonstration arabe : ${videAr > 0
      ? 'INDISPONIBLE — la banque ne porte aucune question de locale `ar`, le repli est affiché'
      : 'servie'}`,
  )
}

// ══════════════════════════════════ 6. RTL et dir sur le collecteur ═══
{
  await page.goto(`${BASE}/ar/opportunites`, { waitUntil: 'networkidle' })

  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir'))
  const sansDir = await page.evaluate(
    () => [...document.querySelectorAll('.annonce__titre a, .annonce__org')]
      .filter(e => e.getAttribute('dir') !== 'auto').length,
  )

  note(
    'P7 — RTL complet et dir="auto" sur toute chaîne du collecteur',
    dir === 'rtl' && sansDir === 0,
    `dir=${dir} · ${sansDir} chaîne(s) du collecteur sans dir="auto"`,
  )

  await page.screenshot({ path: `${SORTIE}-03-tapis-arabe.png`, fullPage: true })
}

await navigateur.close()

const echecs = resultats.filter(r => !r.ok)
writeFileSync(`${SORTIE}.json`, JSON.stringify(resultats, null, 2))

console.log(`\n── ${resultats.length - echecs.length}/${resultats.length} cas conformes ──`)
process.exit(echecs.length === 0 ? 0 : 1)
