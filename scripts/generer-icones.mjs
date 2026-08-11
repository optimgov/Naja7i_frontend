#!/usr/bin/env node
/**
 * generer-icones.mjs — dérive les icônes bitmap depuis `public/favicon.svg`.
 *
 *   node scripts/generer-icones.mjs
 *
 * Pourquoi un script plutôt qu'un PNG déposé une fois : le jour où le tracé de
 * la marque change, un PNG déposé à la main reste en place et personne ne le
 * remarque — l'onglet du navigateur montre le nouveau logo, l'écran d'accueil
 * iOS l'ancien. Ici le SVG est la seule source, et le PNG s'en redéduit.
 *
 * Playwright est déjà une dépendance de développement (audit de rendu). Ajouter
 * `sharp` ou `resvg` pour un seul PNG de 180 px coûterait une dépendance
 * native de plus, pour un service que le navigateur déjà installé rend.
 */

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const SOURCE = 'public/favicon.svg'

/** iOS n'applique aucun arrondi ni aucune marge : la tuile occupe le carré. */
const CIBLES = [{ fichier: 'public/apple-touch-icon.png', taille: 180 }]

const svg = readFileSync(SOURCE, 'utf8')

const navigateur = await chromium.launch()

for (const { fichier, taille } of CIBLES) {
  const page = await navigateur.newPage({
    viewport: { width: taille, height: taille },
    deviceScaleFactor: 1,
  })

  await page.setContent(
    '<style>html,body{margin:0;padding:0}svg{display:block}</style>' +
      svg.replace('width="32" height="32"', `width="${taille}" height="${taille}"`),
  )

  // `omitBackground: false` : la transparence est rendue en noir par iOS sur
  // l'écran d'accueil. On aplatit ici, une bonne fois.
  await page.screenshot({ path: fichier, omitBackground: false })
  await page.close()

  console.log(`${fichier} — ${taille}×${taille}, dérivé de ${SOURCE}`)
}

await navigateur.close()
