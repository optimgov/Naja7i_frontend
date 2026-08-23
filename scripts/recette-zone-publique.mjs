#!/usr/bin/env node
/**
 * recette-zone-publique.mjs — la zone publique v1, cas par cas.
 *
 * PALIER ÉPROUVÉ : AUCUN — visiteur sans compte.
 * Elle ne demande ni session ni droit : tout ce qu'elle mesure est public.
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

// ═════════════ 2 bis. Facettes contextuelles et état vide ═════════════
{
  /*
   * ═══════════════════════════════════════════════════════════════════════
   * LE COMPTEUR DOIT DÉCRIRE LA LISTE QU'ON VA OBTENIR
   *
   * Les compteurs du rail étaient calculés sur la liste COMPLÈTE : « Éducation
   * 14 » restait 14 après avoir coché « Clôture sous 7 jours », alors que deux
   * annonces seulement subsistaient. Le candidat cochait une facette qui
   * annonçait quatorze résultats et en obtenait deux.
   *
   * LE CONTRÔLE COMPARE DEUX ÉTATS DU MÊME ÉCRAN — la somme des compteurs
   * d'une facette à choix unique, avec et sans un autre filtre actif. Vérifier
   * un nombre en dur aurait figé la fixture dans la recette ; comparer deux
   * mesures ne suppose rien de son contenu.
   */
  await page.goto(`${BASE}/fr/opportunites`, { waitUntil: 'networkidle' })

  const sommeNature = async () => page.evaluate(() => {
    const groupes = [...document.querySelectorAll('.rail__groupe')]
    /* Le groupe « Nature » est le deuxième du rail — filière, nature, région. */
    const nature = groupes[1]
    if (!nature) return null
    return [...nature.querySelectorAll('.filtre__n')]
      .reduce((total, n) => total + Number((n.textContent || '0').replace(/\D/g, '')), 0)
  })

  const avant = await sommeNature()

  /* On coche « Clôture sous 7 jours » — une dimension AUTRE que la nature. */
  await page.goto(`${BASE}/fr/opportunites?sous=7j`, { waitUntil: 'networkidle' })
  const apres = await sommeNature()
  const resultats7j = Number((await page.locator('.tapis__compte').innerText()).replace(/\D/g, ''))

  note(
    'les compteurs de facettes suivent les AUTRES filtres actifs',
    avant !== null && apres !== null && apres < avant && apres === resultats7j,
    `somme des compteurs « Nature » : ${avant} sans filtre → ${apres} avec ?sous=7j · `
    + `${resultats7j} résultat(s) affichés`,
  )

  /*
   * AUCUNE FACETTE À ZÉRO N'EST OFFERTE. Une option à zéro est un cul-de-sac :
   * on la coche, on obtient une liste vide, et il faut la décocher.
   */
  const zeros = await page.evaluate(
    () => [...document.querySelectorAll('.filtre__n')]
      .filter(n => Number((n.textContent || '').replace(/\D/g, '')) === 0)
      .length,
  )

  note(
    'aucune facette à zéro n’est proposée',
    zeros === 0,
    `${zeros} option(s) à zéro dans le rail`,
  )

  /*
   * MAIS UNE FACETTE ACTIVE RESTE OFFERTE, FÛT-ELLE À ZÉRO. Sans cette
   * exception, une option cochée qui tombe à zéro à cause d'un autre filtre
   * disparaîtrait du rail — et deviendrait impossible à DÉCOCHER. Le candidat
   * serait enfermé dans une liste vide par un filtre qu'il ne voit plus.
   */
  await page.goto(
    `${BASE}/fr/opportunites?filiere=education&q=zzzzqqqq`,
    { waitUntil: 'networkidle' },
  )

  const activeVisible = await page.evaluate(() => {
    const cases = [...document.querySelectorAll('.rail__groupe input[type="checkbox"]')]
    return cases.some(c => c.checked)
  })

  note(
    'une facette active reste décochable même tombée à zéro',
    activeVisible,
    `case cochée encore présente dans le rail : ${activeVisible}`,
  )

  // ─────────────────────────────── L'ÉTAT VIDE EST ACTIONNABLE
  const vide = await page.evaluate(() => ({
    phrase: (document.querySelector('.vide__phrase')?.textContent || '').trim(),
    criteres: [...document.querySelectorAll('.vide__criteres .nature')]
      .map(n => (n.textContent || '').trim()),
    bouton: (document.querySelector('.vide--filtres .btn')?.textContent || '').trim(),
    sortie: document.querySelectorAll('.vide--filtres a').length,
  }))

  note(
    'l’état vide dit les critères EN CLAIR et offre une sortie',
    vide.phrase.length > 0 && vide.criteres.length >= 2
    && vide.bouton.length > 0 && vide.sortie >= 1,
    `« ${vide.phrase} » · critères : ${vide.criteres.join(' + ') || 'AUCUN'} · `
    + `action : « ${vide.bouton} » · ${vide.sortie} porte(s)`,
  )

  /* ET LA RÉINITIALISATION TIENT EN UNE ACTION — y compris dans l'URL, sans
     quoi un rechargement ramènerait les filtres qu'on vient de retirer. */
  const avantClic = Number((await page.locator('.tapis__compte').innerText()).replace(/\D/g, ''))
  await page.locator('.vide--filtres .btn').click()
  await page.waitForTimeout(400)

  const apresClic = Number((await page.locator('.tapis__compte').innerText()).replace(/\D/g, ''))
  const requete = new URL(page.url()).search

  note(
    'un seul geste retire tous les filtres, URL comprise',
    avantClic === 0 && apresClic > 0 && !requete.includes('filiere') && !requete.includes('q='),
    `${avantClic} → ${apresClic} annonce(s) · URL après le clic : « ${requete || '(aucune requête)'} »`,
  )
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

// ═══════════════════ 5 quater. La recherche globale ═══════════════════
{
  /*
   * ═══════════════════════════════════════════════════════════════════════
   * CE QUE CE BLOC ÉPROUVE, ET POURQUOI CHAQUE POINT EST LÀ
   *
   * Une palette de recherche se juge au clavier, pas à la capture. Les quatre
   * gestes qui suivent sont ceux qu'un candidat fait sans y penser, et chacun
   * casse en silence quand il n'est pas mesuré : la flèche qui ne bouge pas,
   * l'Échap qui ferme sans rendre le focus — et l'on se retrouve au début du
   * document —, le compte qui se met à jour sans être annoncé.
   *
   * `aria-activedescendant` est le point délicat : le focus DOM reste dans la
   * saisie pour qu'on puisse continuer à taper, et c'est un ATTRIBUT qui
   * déplace le curseur virtuel. Rien à l'écran ne le prouve ; il faut le lire.
   */
  const REQUETE = 'administrateur'

  // ── R1. La page complète, et son `noindex, follow` DANS LE HTML SERVI ──
  const html = await fetch(`${BASE}/fr/recherche?q=${REQUETE}`).then(r => r.text())
  const robots = html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/)?.[1] ?? ''

  note(
    '/recherche est marquée noindex,follow dans le HTML servi',
    /noindex/.test(robots) && /follow/.test(robots) && !/nofollow/.test(robots),
    `meta robots = « ${robots || 'ABSENTE'} »`,
  )

  /* Déclarer une canonique sur une page qu'on demande à ne pas indexer envoie
     deux instructions contradictoires. Elle ne doit pas y être. */
  note(
    'elle ne déclare pas de canonique — on n’indexe pas ET on ne canonise pas',
    !/<link[^>]+rel="canonical"/.test(html),
    /<link[^>]+rel="canonical"/.test(html)
      ? 'une balise canonique est posée sur une page noindex'
      : 'aucune canonique, comme attendu',
  )

  // ── R2. La question vient de l'URL, et l'écran la rend ──
  await page.goto(`${BASE}/fr/recherche?q=${REQUETE}`, { waitUntil: 'networkidle' })

  const surPage = await page.evaluate(() => ({
    champ: document.querySelector('.resultats__champ input')?.value ?? '',
    liens: document.querySelectorAll('.resultats__lien').length,
    groupes: document.querySelectorAll('.resultats__titre').length,
    compte: (document.querySelector('.resultats__compte')?.textContent || '').trim(),
    live: document.querySelector('.resultats__compte')?.getAttribute('aria-live') ?? '',
  }))

  note(
    'la question vit dans l’URL et l’écran la restitue',
    surPage.champ === REQUETE && surPage.liens > 0 && surPage.groupes > 0,
    `champ « ${surPage.champ} » · ${surPage.liens} résultat(s) en ${surPage.groupes} groupe(s)`,
  )

  note(
    'le nombre de résultats est annoncé, pas seulement affiché',
    surPage.live === 'polite' && surPage.compte.length > 0,
    `aria-live=${surPage.live || '—'} · « ${surPage.compte} »`,
  )

  // ── R3. L'état vide donne DEUX portes, pas une phrase seule ──
  await page.goto(`${BASE}/fr/recherche?q=zzzzqqqqxxxx`, { waitUntil: 'networkidle' })
  const portes = await page.locator('.resultats__portes a').count()
  const phraseVide = (await page.locator('.resultats__vide p').innerText().catch(() => '')).trim()

  note(
    'l’état vide est actionnable — il porte ses sorties',
    portes >= 2 && phraseVide.length > 0,
    `« ${phraseVide} » · ${portes} porte(s) de sortie`,
  )

  // ── R4. La palette : ouverture, flèches, Entrée, Échap, retour du focus ──
  await page.goto(`${BASE}/fr/opportunites`, { waitUntil: 'networkidle' })

  const declencheur = page.locator('.recherche-globale__declencheur')
  await declencheur.click()
  await page.waitForTimeout(200)

  const focusOuverture = await page.evaluate(
    () => document.activeElement?.className ?? '',
  )

  note(
    'la palette s’ouvre et donne le focus à sa saisie',
    focusOuverture.includes('palette__saisie'),
    `focus sur « ${focusOuverture || 'rien'} »`,
  )

  await page.keyboard.type(REQUETE)
  await page.waitForTimeout(500)

  const avantFleche = await page.locator('.palette__saisie').getAttribute('aria-activedescendant')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(120)
  const apresFleche = await page.locator('.palette__saisie').getAttribute('aria-activedescendant')

  const resteDansSaisie = await page.evaluate(
    () => (document.activeElement?.className ?? '').includes('palette__saisie'),
  )

  note(
    'les flèches déplacent le curseur virtuel SANS quitter la saisie',
    Boolean(avantFleche) && avantFleche !== apresFleche && resteDansSaisie,
    `aria-activedescendant : ${avantFleche ?? '—'} → ${apresFleche ?? '—'} · `
    + `focus DOM resté dans la saisie : ${resteDansSaisie}`,
  )

  const compteLive = await page.locator('.palette__compte').getAttribute('aria-live')
  const compteTexte = (await page.locator('.palette__compte').innerText()).trim()

  note(
    'le compte de la palette est annoncé',
    compteLive === 'polite' && compteTexte.length > 0,
    `aria-live=${compteLive || '—'} · « ${compteTexte} »`,
  )

  /* ÉCHAP FERME ET REND LE FOCUS. Sans ce retour, on ferme la palette et l'on
     repart du début du document — c'est le détail qu'on oublie en recopiant un
     comportement de panneau, et c'est pour cela qu'il vit dans `usePanneau`. */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  const fermee = await page.locator('#palette-recherche').count()
  const focusRendu = await page.evaluate(
    () => (document.activeElement?.className ?? '').includes('recherche-globale__declencheur'),
  )

  note(
    'Échap ferme la palette et rend le focus au déclencheur',
    fermee === 0 && focusRendu,
    `panneau dans le DOM : ${fermee} · focus rendu au déclencheur : ${focusRendu}`,
  )

  /* Fermée, elle n'est pas seulement invisible : elle n'est plus dans l'arbre.
     `v-show` aurait laissé une liste que la tabulation traverse à l'aveugle. */
  note(
    'fermée, la palette n’est plus dans l’arbre du document',
    fermee === 0,
    `#palette-recherche : ${fermee} nœud(s)`,
  )

  // ── R5. Entrée ouvre le résultat actif ──
  /*
   * `fill` ET NON `type`, ET C'EST LA RECETTE QUI AVAIT TORT.
   *
   * La palette CONSERVE sa question d'une ouverture à l'autre — c'est le bon
   * comportement : rouvrir la recherche juste après l'avoir fermée par
   * mégarde ne doit pas effacer ce qu'on venait de taper. Mais `type` AJOUTE au
   * contenu existant : la seconde ouverture cherchait donc
   * « administrateuradministrateur », ne trouvait rien, et Entrée n'avait aucun
   * résultat actif à ouvrir. Le cas rougissait sur un défaut du test.
   *
   * `fill` remplace la valeur, ce qui est aussi le geste réel d'un candidat qui
   * sélectionne tout et retape.
   */
  await declencheur.click()
  await page.waitForTimeout(200)
  await page.locator('.palette__saisie').fill(REQUETE)
  await page.waitForTimeout(500)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)

  const arrivee = new URL(page.url()).pathname

  note(
    'Entrée ouvre le résultat actif',
    arrivee !== '/fr/opportunites' && arrivee.startsWith('/fr/'),
    `arrivée sur ${arrivee}`,
  )

  await page.screenshot({ path: `${SORTIE}-05-recherche.png`, fullPage: true })
}

// ═════ 5 quinquies. Le méga-menu, le menu « Plus », et aucun lien mort ═════
{
  /*
   * ═══════════════════════════════════════════════════════════════════════
   * UN MÉGA-MENU SE JUGE AU CLAVIER
   *
   * Les quatre comportements exigés — ouverture au clic ET au clavier,
   * fermeture par Échap et par clic extérieur, focus RENDU au déclencheur, un
   * seul panneau ouvert — ne se voient sur aucune capture. Chacun casse en
   * silence, et le plus coûteux est le retour du focus : sans lui, on ferme le
   * menu et l'on repart du début du document.
   *
   * `usePanneau` les porte pour les trois panneaux de l'en-tête. Ce bloc
   * éprouve le méga-menu, la palette étant éprouvée plus haut : si le
   * composable cédait, les deux rougiraient ensemble.
   */
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/fr/concours`, { waitUntil: 'networkidle' })

  const declencheur = page.locator('.nav__declencheur')

  // ── M1. Ouverture, et le panneau vient du CATALOGUE ──
  await declencheur.click()
  await page.waitForTimeout(250)

  const ouvert = await page.evaluate(() => {
    const bouton = document.querySelector('.nav__declencheur')
    const panneau = document.querySelector('#mega-concours')
    return {
      expanded: bouton?.getAttribute('aria-expanded') ?? '',
      controls: bouton?.getAttribute('aria-controls') ?? '',
      colonnes: document.querySelectorAll('.mega__colonne').length,
      liensFiliere: [...document.querySelectorAll('.mega__titre a')]
        .map(a => a.getAttribute('href') ?? ''),
      familles: document.querySelectorAll('.mega__lien').length,
      etats: [...document.querySelectorAll('.mega__etat')].map(e => (e.textContent || '').trim()),
      illisible: document.querySelectorAll('.mega__illisible').length,
    }
  })

  note(
    'le méga-menu s’ouvre au clic et s’annonce développé',
    ouvert.expanded === 'true' && ouvert.controls === 'mega-concours',
    `aria-expanded=${ouvert.expanded} · aria-controls=${ouvert.controls}`,
  )

  note(
    'ses colonnes viennent du catalogue, pas d’une liste écrite dans le composant',
    ouvert.illisible === 0 && ouvert.colonnes > 0 && ouvert.familles > 0
    && ouvert.liensFiliere.every(h => h.startsWith('/fr/concours/')),
    ouvert.illisible
      ? 'le panneau rend son état « catalogue illisible » : rien n’est mesuré ici'
      : `${ouvert.colonnes} colonne(s) · ${ouvert.familles} famille(s) · `
        + `filières : ${ouvert.liensFiliere.join(', ')}`,
  )

  /* AUCUN CODE D'ÉNUMÉRATION BRUT À L'ÉCRAN : `open`, `waitlist` et `closed`
     se traduisent. Le contrôle cherche le code, pas la traduction — il vaut
     donc dans les deux langues. */
  note(
    'l’état de disponibilité est traduit, jamais rendu en code',
    ouvert.etats.length > 0 && ouvert.etats.every(e => !/^(open|waitlist|closed)$/.test(e)),
    `états rendus : ${ouvert.etats.join(' · ') || 'aucun'}`,
  )

  // ── M2. La tabulation ENTRE dans le panneau ──
  /* Le panneau est SŒUR de la nav dans le DOM, immédiatement après elle : la
     tabulation depuis la dernière entrée du menu doit y entrer naturellement.
     Un panneau posé ailleurs aurait obligé le candidat à traverser tout
     l'en-tête pour atteindre ce qu'il vient d'ouvrir. */
  await page.locator('.mega__titre a').first().focus()
  const dansPanneau = await page.evaluate(
    () => Boolean(document.querySelector('#mega-concours')?.contains(document.activeElement)),
  )

  note(
    'le contenu du méga-menu est atteignable au clavier',
    dansPanneau,
    `focus à l’intérieur du panneau : ${dansPanneau}`,
  )

  // ── M3. Échap ferme ET rend le focus ──
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  const apresEchap = await page.evaluate(() => ({
    panneau: document.querySelectorAll('#mega-concours').length,
    expanded: document.querySelector('.nav__declencheur')?.getAttribute('aria-expanded') ?? '',
    focus: (document.activeElement?.className ?? ''),
  }))

  note(
    'Échap ferme le méga-menu et rend le focus à son déclencheur',
    apresEchap.panneau === 0 && apresEchap.expanded === 'false'
    && apresEchap.focus.includes('nav__declencheur'),
    `panneau : ${apresEchap.panneau} nœud(s) · aria-expanded=${apresEchap.expanded} · `
    + `focus sur « ${apresEchap.focus || 'rien'} »`,
  )

  // ── M4. Un clic extérieur ferme — sans voler le focus ──
  await declencheur.click()
  await page.waitForTimeout(200)

  /*
   * ON CLIQUE UN POINT, PAS UN ÉLÉMENT.
   *
   * La première écriture visait le `<h1>` de la page : Playwright a refusé
   * pendant trente secondes, en expliquant que le panneau interceptait le clic.
   * C'était exact, et c'était même la preuve que le méga-menu se comporte comme
   * un méga-menu — il RECOUVRE le contenu. Un clic « extérieur » doit donc
   * viser une coordonnée réellement située hors du panneau, ce qui est aussi le
   * geste du candidat : il clique dans la page, sous le menu déployé.
   */
  const sousLePanneau = await page.evaluate(() => {
    const r = document.querySelector('#mega-concours')?.getBoundingClientRect()
    return { x: Math.round(window.innerWidth / 2), y: Math.round((r?.bottom ?? 0) + 60) }
  })

  await page.mouse.click(sousLePanneau.x, sousLePanneau.y)
  await page.waitForTimeout(250)

  const apresDehors = await page.evaluate(() => ({
    panneau: document.querySelectorAll('#mega-concours').length,
    focus: document.activeElement?.className ?? '',
  }))

  note(
    'un clic extérieur ferme le panneau sans reprendre le focus',
    apresDehors.panneau === 0 && !apresDehors.focus.includes('nav__declencheur'),
    `panneau : ${apresDehors.panneau} · focus après le clic : `
    + `« ${apresDehors.focus || 'aucun'} » (le rendre ici le volerait à l’élément désigné)`,
  )

  // ── M5. UN SEUL panneau ouvert à la fois ──
  await declencheur.click()
  await page.waitForTimeout(200)
  await page.locator('.recherche-globale__declencheur').click()
  await page.waitForTimeout(250)

  const simultanes = await page.evaluate(() => ({
    mega: document.querySelectorAll('#mega-concours').length,
    palette: document.querySelectorAll('#palette-recherche').length,
  }))

  note(
    'ouvrir la recherche ferme le méga-menu — un seul panneau à la fois',
    simultanes.mega === 0 && simultanes.palette === 1,
    `méga-menu : ${simultanes.mega} · palette : ${simultanes.palette}`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // ── M6. En RTL, le panneau tient dans la fenêtre ──
  /* Un panneau ancré à son déclencheur déborderait du côté fermé en arabe.
     Celui-ci s'ancre sur l'en-tête, `inset-inline: 0` — le contrôle vérifie
     qu'aucun débordement horizontal n'apparaît, panneau ouvert. */
  await page.goto(`${BASE}/ar/concours`, { waitUntil: 'networkidle' })
  await page.locator('.nav__declencheur').click()
  await page.waitForTimeout(300)

  const rtl = await page.evaluate(() => {
    const p = document.querySelector('#mega-concours')
    const r = p?.getBoundingClientRect()
    return {
      dir: document.documentElement.dir,
      ouvert: Boolean(p),
      deborde: r ? r.left < -1 || r.right > document.documentElement.clientWidth + 1 : false,
      defilement: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }
  })

  note(
    'en arabe, le méga-menu s’ouvre et ne déborde pas de la fenêtre',
    rtl.dir === 'rtl' && rtl.ouvert && !rtl.deborde && !rtl.defilement,
    `dir=${rtl.dir} · panneau ouvert : ${rtl.ouvert} · débordement : ${rtl.deborde} · `
    + `défilement horizontal : ${rtl.defilement}`,
  )

  // ── M7. Le menu « Plus » sur téléphone ──
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${BASE}/fr/opportunites`, { waitUntil: 'networkidle' })

  const plus = page.locator('.plus__declencheur')
  await plus.click()
  await page.waitForTimeout(250)

  const contenuPlus = await page.evaluate(
    () => [...document.querySelectorAll('.plus__lien')].map(a => a.getAttribute('href') ?? ''),
  )

  note(
    'le menu « Plus » s’ouvre et ne porte que des routes réelles',
    contenuPlus.length > 0 && contenuPlus.every(h => h.startsWith('/')),
    `${contenuPlus.length} entrée(s) : ${contenuPlus.join(', ')}`,
  )

  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  const plusFerme = await page.evaluate(() => ({
    panneau: document.querySelectorAll('#menu-plus').length,
    focus: document.activeElement?.className ?? '',
  }))

  note(
    'Échap ferme « Plus » et rend le focus à son déclencheur',
    plusFerme.panneau === 0 && plusFerme.focus.includes('plus__declencheur'),
    `panneau : ${plusFerme.panneau} · focus sur « ${plusFerme.focus || 'rien'} »`,
  )

  // ── M8. AUCUN LIEN PUBLIC NE MÈNE À UNE PAGE QUI N'EXISTE PAS ──
  /*
   * On récolte les destinations INTERNES de toutes les surfaces de navigation —
   * en-tête, méga-menu, menu « Plus », barre basse, pied — et on les demande au
   * serveur. Un 404 dans un menu de premier niveau coûte plus qu'une place
   * inoccupée ; c'est la raison pour laquelle « Annales » n'y figure pas.
   *
   * `404 assumé, jamais 403` est la règle du dépôt : un 403 sur une surface
   * publique serait un défaut à part entière, et il est signalé comme tel.
   */
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/fr`, { waitUntil: 'networkidle' })
  await page.locator('.nav__declencheur').click()
  await page.waitForTimeout(300)

  const destinations = await page.evaluate(() => {
    const zones = ['.publique__entete', '#mega-concours', '.barre-basse', '.pied']
    const vus = new Set()

    for (const zone of zones) {
      for (const a of document.querySelectorAll(`${zone} a[href]`)) {
        const href = a.getAttribute('href') ?? ''
        /* Seules les destinations INTERNES : les avis officiels partent chez
           l'administration, et leur disponibilité ne nous appartient pas. */
        if (href.startsWith('/') && !href.startsWith('//')) vus.add(href)
      }
    }

    return [...vus]
  })

  const morts = []
  for (const chemin of destinations) {
    const r = await fetch(`${BASE}${chemin}`, { redirect: 'manual' })
    if (r.status === 403) morts.push(`${chemin} → 403 (la règle du dépôt est 404, jamais 403)`)
    else if (r.status >= 400) morts.push(`${chemin} → ${r.status}`)
  }

  note(
    'aucun lien des surfaces de navigation ne mène à une page absente',
    destinations.length > 0 && morts.length === 0,
    morts.length
      ? `LIENS MORTS : ${morts.join(' · ')}`
      : `${destinations.length} destination(s) vérifiée(s) : ${destinations.join(', ')}`,
  )
}

// ═══ 5 sexies. CE QUI NE DOIT PAS ÊTRE INDEXÉ NE L'EST PAS, DANS LE HTML SERVI ═══
{
  /*
   * ═══════════════════════════════════════════════════════════════════════
   * POURQUOI CE CONTRÔLE LIT LE HTML SERVI, ET PAS LE DOM
   *
   * Un robot d'indexation n'exécute pas toujours le JavaScript, et quand il le
   * fait, c'est lors d'un second passage qui peut ne jamais venir. Une balise
   * `robots` posée après hydratation ne protège donc rien : elle rassure la
   * personne qui inspecte l'écran, et laisse la page indexée. Le contrôle porte
   * sur ce que le serveur ENVOIE — `fetch`, pas `page.evaluate`.
   *
   * TROIS POLITIQUES, ET ELLES NE SE CONFONDENT PAS
   *
   *   authentification   noindex, nofollow — rien derrière ce formulaire n'a
   *                      vocation à être découvert, et suivre ses liens ne
   *                      mènerait qu'à d'autres redirections vers la connexion ;
   *   /recherche         noindex, FOLLOW — les résultats ne s'indexent pas, mais
   *                      les pages qu'ils désignent, si ;
   *   catalogue          aucune balise `robots` — ce sont les pages qu'on veut
   *                      voir remonter, et une balise de trop y coûterait tout.
   *
   * Le troisième cas est le plus important à mesurer : une politique posée au
   * GABARIT peut déborder sur le gabarit public d'un seul copier-coller, et
   * personne ne s'en apercevrait avant la chute du trafic.
   */
  const robotsDe = async (chemin) => {
    const html = await fetch(`${BASE}${chemin}`, {
      headers: { Accept: 'text/html' },
    }).then((r) => r.text())

    return html.match(/<meta[^>]+name="robots"[^>]+content="([^"]+)"/)?.[1] ?? ''
  }

  // ── R10. Les écrans d'authentification, dans les deux langues ──
  for (const chemin of [
    '/fr/connexion',
    '/fr/inscription',
    '/fr/mot-de-passe-oublie',
    '/fr/nouveau-mot-de-passe',
    '/fr/verifier-email',
    '/ar/connexion',
    '/ar/inscription',
  ]) {
    const robots = await robotsDe(chemin)

    note(
      `R10 — ${chemin} est noindex,nofollow dans le HTML servi`,
      /noindex/.test(robots) && /nofollow/.test(robots),
      `meta robots = « ${robots || 'ABSENTE'} »`,
    )
  }

  // ── R11. La page d'erreur, qui ne passe par aucun gabarit ──
  {
    const robots = await robotsDe('/fr/page-qui-n-existe-pas')

    note(
      "R11 — la page d'erreur reste noindex",
      /noindex/.test(robots),
      `meta robots = « ${robots || 'ABSENTE'} »`,
    )
  }

  // ── R12. Le catalogue public ne doit RIEN porter ──
  for (const chemin of ['/fr/concours', '/fr/opportunites', '/ar/concours']) {
    const robots = await robotsDe(chemin)

    note(
      `R12 — ${chemin} reste indexable (aucune balise robots)`,
      robots === '',
      robots ? `meta robots = « ${robots} » — la politique a débordé` : 'aucune balise robots',
    )
  }
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
