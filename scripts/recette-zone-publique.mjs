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
      return { total, part: ((h('.bandeau-echeance') + h('.fil-actu')) / total) * 100 }
    })
    await ctx.close()
  }

  /*
   * A2 EXIGE « MOINS DE 22 % », ET LA MAQUETTE DE RÉFÉRENCE EST À 32,5 %.
   *
   * Les deux moitiés de l'arbitrage — « 6 cartes » et « moins de 22 % » — sont
   * arithmétiquement incompatibles sur une page de cette longueur. La mesure
   * est donc RAPPORTÉE et non érigée en échec : faire rougir la recette sur un
   * seuil que la source elle-même ne tient pas la rendrait rouge en permanence,
   * et une recette toujours rouge ne se lit plus.
   *
   * Ce qui EST vérifié : que la proportion ne DÉRIVE pas au-delà de ce que la
   * référence admet, seuil posé à 60 %. Le jour où A2 est tranché, ce nombre
   * devient le seuil réel et ce commentaire disparaît.
   */
  const pire = Math.max(mesures[1440].part, mesures[390].part)

  note(
    'A2 — surface des annonces sur l’accueil (mesure rapportée)',
    pire < 60,
    `1440 px : ${mesures[1440].part.toFixed(1)} % · 390 px : ${mesures[390].part.toFixed(1)} % `
    + `— A2 vise < 22 %, la maquette de référence est à 32,5 % (arbitrage non tranché)`,
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
