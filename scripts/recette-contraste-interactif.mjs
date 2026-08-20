#!/usr/bin/env node
/**
 * recette-contraste-interactif.mjs — le contraste DANS les états interactifs.
 *
 *   node scripts/recette-contraste-interactif.mjs [baseUrl] [--complet]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE SCRIPT EXISTE À CÔTÉ DE `auditer.mjs`
 *
 * `docs/design/ui-v3/scripts/auditer.mjs` mesure un écran AU REPOS : il charge,
 * il attend, il sonde. C'est ce qu'il doit faire, et il le fait bien — mais un
 * survol et un focus changent des couleurs, et ces couleurs-là ne sont jamais
 * mesurées.
 *
 * Le défaut qui a motivé ce fichier tenait dans 0,018 point de ratio :
 * `.filtre:hover` pose `--surface-douce` sous la ligne, et `.filtre__n` restait
 * en `--texte-tenu`, soit 4,482:1 pour un seuil de 4,5. Invisible en relecture,
 * invisible à l'audit, visible pour qui passe la souris sur un rail de filtres.
 *
 * `auditer.mjs` N'EST PAS MODIFIÉ : il est livré par la conception, et le dépôt
 * l'appelle tel quel (voir l'en-tête de `scripts/auditer-ecrans.mjs`). Ce qui
 * relève du produit — quels éléments sont interactifs, lesquels comptent —
 * vit ici.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IL VÉRIFIE D'ABORD QUE L'ÉTAT S'EST DÉCLENCHÉ
 *
 * Un survol qui ne prend pas mesure l'état au repos et le déclare conforme :
 * c'est le faux vert que ce dépôt traque depuis `64ba9d7`. Chaque passe de
 * survol contrôle donc que la composition de l'élément a RÉELLEMENT changé
 * avant de conclure quoi que ce soit sur son contraste.
 */

import { writeFileSync } from 'node:fs'

import { chromium } from 'playwright'

const args = process.argv.slice(2)
const BASE = args.find((a) => a.startsWith('http')) || process.env.BASE_URL || 'http://localhost:3000'
const COMPLET = args.includes('--complet')
const SORTIE = process.env.SORTIE || '/tmp/recette-contraste-interactif'

/**
 * Les écrans SANS backend : leurs données viennent de la fixture servie par le
 * BFF. Ils sont donc jouables en intégration continue, comme la liste `CHEMINS_CI`
 * d'`auditer-ecrans.mjs`.
 */
const ECRANS_AUTONOMES = ['/opportunites', '/connexion', '/inscription']

/**
 * Les écrans qui LISENT LE CATALOGUE. Ils exigent Laravel, et `--complet` les
 * ajoute — c'est ce que passe `npm run recette`, qui a démarré l'API.
 */
const ECRANS_AVEC_CATALOGUE = ['/', '/se-preparer', '/concours', '/tarifs']

const LOCALES = ['fr', 'ar']
const LARGEURS = [1440, 390]
const THEMES = ['clair', 'sombre']

/**
 * Les éléments dont un état interactif change la composition.
 *
 * On ne balaie pas « tout ce qui est cliquable » : la liste nomme ce que le
 * produit tient pour interactif, et une classe qui n'y figure pas est un oubli
 * qu'on peut voir, là où un balayage muet n'aurait rien dit.
 */
const INTERACTIFS = [
  '.filtre',
  '.vue',
  '.nav__lien',
  '.nav__declencheur',
  '.mega__lien',
  '.mega__titre',
  '.plus__lien',
  '.lien-second',
  '.btn',
  '.btn--fantome',
  '.bascule',
  '.bascule-theme',
  '.annonce__titre a',
  '.pied__liste a',
  '.fil a',
  '.barre-basse__lien',
  '.recherche input',
  '.palette__resultat',
  '.echeance-ligne__lien',
]

/** Combien d'exemplaires d'une même classe on éprouve. Au-delà, c'est la même règle CSS. */
const PAR_CLASSE = 3

/** Combien de tabulations on enchaîne pour éprouver `:focus-visible`. */
const TABULATIONS = 45

const resultats = []
const note = (cas, ok, constate) => {
  resultats.push({ cas, ok, constate })
  console.log(`${ok ? '  ok  ' : '  ✗   '}${cas}\n        ${constate}`)
}

/**
 * La sonde de contraste, exécutée DANS la page sur un seul sous-arbre.
 *
 * Même formule que `auditer.mjs` — luminance relative WCAG 2.2, fond effectif
 * remonté jusqu'au premier ancêtre opaque. Elle est recopiée plutôt
 * qu'importée parce qu'elle doit être sérialisable vers le navigateur ; toute
 * divergence de résultat entre les deux scripts serait un défaut, et les deux
 * mesurent la fixture, donc se contredirait visiblement.
 */
function sonderSousArbre(racine) {
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  const rgba = (v) => {
    const t = String(v)
    if (/^(transparent|none)$/.test(t)) return null
    const m = t.match(/[\d.]+/g)
    if (!m || m.length < 3) return null
    const norme = /^color\(/.test(t) && m.slice(0, 3).every((x) => +x <= 1)
    const k = norme ? 255 : 1
    return [+m[0] * k, +m[1] * k, +m[2] * k, m.length > 3 ? +m[3] : 1]
  }
  const fondEffectif = (e) => {
    let n = e
    while (n && n !== document.documentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor)
      if (c && c[3] > 0.85) return c.slice(0, 3)
      n = n.parentElement
    }
    const c = rgba(getComputedStyle(document.body).backgroundColor)
    return c ? c.slice(0, 3) : [255, 255, 255]
  }
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const nom = (e) => {
    const c = typeof e.className === 'string' && e.className
      ? '.' + e.className.trim().split(/\s+/)[0]
      : ''
    return e.tagName.toLowerCase() + c
  }

  const sortie = []

  for (const e of [racine, ...racine.querySelectorAll('*')]) {
    const propre = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).length
    if (!propre) continue

    const s = getComputedStyle(e)
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity < 0.15) continue

    const r = e.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue

    const av = rgba(s.color)
    if (!av || av[3] < 0.15) continue

    const fd = fondEffectif(e)
    const px = parseFloat(s.fontSize)
    const gras = (parseInt(s.fontWeight, 10) || 400) >= 700
    const seuil = px >= 24 || (gras && px >= 18.66) ? 3 : 4.5
    const cr = ratio(av.slice(0, 3), fd)

    sortie.push({
      selecteur: nom(e),
      ratio: +cr.toFixed(3),
      seuil,
      taille: Math.round(px),
      couleur: s.color,
      fond: `rgb(${fd.join(', ')})`,
      texte: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
      conforme: cr >= seuil,
    })
  }

  return sortie
}

/** L'empreinte d'un élément : ce qui doit changer quand un état se déclenche. */
function empreinte(e) {
  const s = getComputedStyle(e)
  return [s.color, s.backgroundColor, s.borderColor, s.outlineStyle, s.outlineColor,
    s.textDecorationLine].join('|')
}

const navigateur = await chromium.launch()

const chemins = COMPLET ? [...ECRANS_AUTONOMES, ...ECRANS_AVEC_CATALOGUE] : ECRANS_AUTONOMES

console.log(`# Contraste des états interactifs — ${BASE}`)
console.log(
  `${chemins.length} écran(s) × ${LOCALES.length} langue(s) × ${LARGEURS.length} largeur(s) × ${THEMES.length} thème(s)`,
)
if (!COMPLET) {
  /* Une couverture réduite qu'on ne dit pas se lit comme une couverture
     complète — même règle que le mode CI d'`auditer-ecrans.mjs`. */
  console.log(
    `Mode autonome — ${ECRANS_AVEC_CATALOGUE.length} écran(s) NON éprouvés, faute de backend : `
    + `${ECRANS_AVEC_CATALOGUE.join(', ')}. Passer --complet avec une API en marche.\n`,
  )
} else {
  console.log()
}

/** Chaque anomalie est retenue une fois, avec la liste de ses contextes. */
const anomalies = new Map()
const inertes = new Map()
let sousArbresMesures = 0
let etatsDeclenches = 0

for (const chemin of chemins) {
  for (const langue of LOCALES) {
    for (const largeur of LARGEURS) {
      for (const theme of THEMES) {
        const contexte = await navigateur.newContext({ viewport: { width: largeur, height: 900 } })
        const page = await contexte.newPage()
        const url = `${BASE}/${langue}${chemin === '/' ? '' : chemin}`
        const ou = `${chemin} · ${langue} · ${largeur}px · ${theme}`

        try {
          const reponse = await page.goto(url, { waitUntil: 'networkidle' })

          if (!reponse || reponse.status() >= 400) {
            note(`écran joignable — ${ou}`, false, `HTTP ${reponse?.status() ?? 'aucune réponse'} sur ${url}`)
            continue
          }

          if (theme === 'sombre') {
            /* La bascule DOIT être atteignable : si elle ne l'est pas, la passe
               mesure le thème clair en croyant mesurer le sombre. On le dit. */
            const bascule = page.locator('[data-bascule-theme]').first()
            if (await bascule.count() === 0 || !(await bascule.isVisible())) {
              note(
                `la bascule de thème reste atteignable — ${ou}`,
                false,
                'aucune bascule visible : le thème sombre ne peut pas être mesuré ici',
              )
              continue
            }
            await bascule.click()
            await page.waitForTimeout(250)
          }

          // ─────────────────────────────────────────── 1. le survol
          for (const selecteur of INTERACTIFS) {
            const tous = page.locator(selecteur)
            const n = Math.min(await tous.count(), PAR_CLASSE)

            for (let i = 0; i < n; i++) {
              const cible = tous.nth(i)
              if (!(await cible.isVisible())) continue

              /*
               * ON RETIRE LA SOURIS AVANT DE LIRE L'ÉTAT AU REPOS.
               *
               * Sans cette ligne, le script produisait un FAUX INERTE, et c'est
               * exactement le genre de silence qu'il est censé empêcher : deux
               * sélecteurs de cette liste désignent parfois le MÊME élément —
               * `.btn` et `.btn--fantome` sur le bouton de filtres à 390 px. Le
               * second le trouvait déjà survolé par le premier, lisait deux fois
               * l'état de survol, concluait « rien ne change » et sautait la
               * mesure. Le sous-arbre n'était donc jamais éprouvé, et rien ne le
               * disait.
               */
              await page.mouse.move(0, 0)
              await page.waitForTimeout(60)

              const avant = await cible.evaluate(empreinte)
              await cible.hover({ timeout: 3000 }).catch(() => {})
              await page.waitForTimeout(120)
              const apres = await cible.evaluate(empreinte)

              /* Rien n'a bougé : soit la règle de survol n'existe pas — cas
                 légitime —, soit une règle plus tardive la recouvre. L'indice
                 est porté par la clé : sans lui, un seul exemplaire inerte
                 ferait passer toute la classe pour inerte. */
              if (avant === apres) {
                const cle = `${selecteur} [${i}]`
                if (!inertes.has(cle)) inertes.set(cle, new Set())
                inertes.get(cle).add(ou)
                continue
              }

              etatsDeclenches++
              const mesures = await cible.evaluate(sonderSousArbre)
              sousArbresMesures++

              for (const m of mesures.filter((x) => !x.conforme)) {
                const cle = `survol|${selecteur}|${m.selecteur}|${m.couleur}|${m.fond}`
                if (!anomalies.has(cle)) {
                  anomalies.set(cle, { etat: 'survol', porteur: selecteur, ...m, contextes: new Set() })
                }
                anomalies.get(cle).contextes.add(ou)
              }
            }
          }

          // ────────────────────────────────── 2. le focus au CLAVIER
          /*
           * `:focus-visible` ne se déclenche pas de la même façon selon
           * l'origine du focus : un `element.focus()` programmatique ne le fait
           * pas naître sur tous les types de commande. La tabulation, si — et
           * c'est le geste réel d'un candidat au clavier.
           */
          const vus = new Set()

          for (let i = 0; i < TABULATIONS; i++) {
            await page.keyboard.press('Tab')

            const signature = await page.evaluate(() => {
              const e = document.activeElement
              if (!e || e === document.body || e === document.documentElement) return null
              const c = typeof e.className === 'string' && e.className
                ? '.' + e.className.trim().split(/\s+/)[0]
                : ''
              return e.tagName.toLowerCase() + c + '|' + (e.textContent || '').trim().slice(0, 20)
            })

            if (signature === null || vus.has(signature)) continue
            vus.add(signature)

            const focalise = await page.evaluateHandle(() => document.activeElement)
            const mesures = await focalise.evaluate(sonderSousArbre)
            await focalise.dispose()
            sousArbresMesures++

            for (const m of mesures.filter((x) => !x.conforme)) {
              const cle = `focus|${signature}|${m.selecteur}|${m.couleur}|${m.fond}`
              if (!anomalies.has(cle)) {
                anomalies.set(cle, { etat: 'focus', porteur: signature.split('|')[0], ...m, contextes: new Set() })
              }
              anomalies.get(cle).contextes.add(ou)
            }
          }
        } finally {
          await page.close()
          await contexte.close()
        }
      }
    }
  }
}

await navigateur.close()

// ──────────────────────────────────────────────────────────── verdict

const liste = [...anomalies.values()].map((a) => ({ ...a, contextes: [...a.contextes] }))

note(
  'aucun texte sous son seuil WCAG en survol ou au focus',
  liste.length === 0,
  liste.length === 0
    ? `${sousArbresMesures} sous-arbre(s) mesuré(s), ${etatsDeclenches} état(s) de survol réellement déclenché(s)`
    : `${liste.length} composition(s) fautive(s) :\n`
      + liste.slice(0, 12).map((a) =>
        `          [${a.etat}] ${a.porteur} → ${a.selecteur} : ${a.ratio} (seuil ${a.seuil}), `
        + `${a.couleur} sur ${a.fond}\n            « ${a.texte} » · ${a.contextes[0]}`
        + (a.contextes.length > 1 ? ` +${a.contextes.length - 1}` : ''),
      ).join('\n'),
)

/*
 * LA MESURE A-T-ELLE MESURÉ QUELQUE CHOSE ? Un balayage qui ne déclenche aucun
 * état rendrait le même vert qu'un produit conforme. Le seuil est bas et
 * volontairement grossier : il ne juge pas la qualité, il atteste que le
 * dispositif a fonctionné.
 */
note(
  'les états interactifs se sont réellement déclenchés',
  etatsDeclenches > 0 && sousArbresMesures > 0,
  `${etatsDeclenches} survol(s) ayant changé la composition · ${sousArbresMesures} sous-arbre(s) sondé(s)`,
)

if (inertes.size) {
  console.log('\n  Pour information — sélecteurs présents dont le survol ne change rien :')
  for (const [cle, ou] of inertes) {
    console.log(`    ${cle} · ${ou.size} contexte(s)`)
  }
  console.log(
    '    (légitime pour un élément sans règle de survol ; suspect pour une commande.)',
  )
}

const echecs = resultats.filter((r) => !r.ok)
writeFileSync(`${SORTIE}.json`, JSON.stringify({ resultats, anomalies: liste }, null, 2))

console.log(`\n── ${resultats.length - echecs.length}/${resultats.length} cas conformes ──`)
process.exit(echecs.length === 0 ? 0 : 1)
