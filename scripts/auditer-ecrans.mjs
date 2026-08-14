#!/usr/bin/env node
/**
 * auditer-ecrans.mjs — passe la liste des écrans de l'application au crible de
 * `docs/design/ui-v3/scripts/auditer.mjs`, dans un vrai navigateur.
 *
 * Pourquoi une enveloppe plutôt qu'un appel direct :
 *
 *  1. `auditer.mjs` prend UNE cible et décline ses variantes par fragment
 *     d'URL (`--hash`). L'application a de vraies routes — `/fr/concours`,
 *     `/ar/connexion` — qui ne sont pas des fragments. Il faut donc un appel
 *     par écran, et un endroit qui tienne la liste.
 *  2. Son défaut de binaire est `/opt/pw-browsers/chromium`, chemin d'image de
 *     conteneur qui n'existe sur aucun poste. On résout ici le Chromium que
 *     Playwright a réellement installé et on le lui passe. Le script du socle
 *     de conception n'est pas modifié : il est livré par la conception, on
 *     l'appelle tel quel.
 *  3. Le RTL ne se déclenche pas par un bouton mais par le préfixe de langue
 *     (`strategy: 'prefix'`). Une URL arabe EST la variante RTL — la bascule
 *     `--rtl` d'`auditer.mjs` ne s'applique qu'aux pages où les deux langues
 *     cohabitent, ce qui n'est le cas d'aucun écran ici.
 *
 *   npm run audit                      # la liste par défaut, FR et AR
 *   npm run audit -- /fr/connexion     # des écrans précis
 *   npm run audit -- --base http://localhost:3000 --largeur 1440
 *   npm run audit -- --sombre "[data-bascule-theme]"
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { chromium } from 'playwright'

const ICI = dirname(fileURLToPath(import.meta.url))
const AUDITEUR = resolve(ICI, '../docs/design/ui-v3/scripts/auditer.mjs')

/**
 * Les écrans livrés, sans préfixe de langue — il est ajouté pour chaque locale.
 * Les paramètres d'URL sont des valeurs réelles du catalogue, pas des exemples :
 * un écran de détail visité avec un identifiant inventé rend son état vide, et
 * c'est l'état vide qu'on auditerait.
 */
const ECRANS = [
  ['accueil', '/'],
  ['catalogue', '/concours'],
  ['filière', '/concours/sciences-education'],
  ['famille', '/concours/famille/crmef'],
  ['spécialité', '/concours/famille/crmef/informatique'],
  ['connexion', '/connexion'],
  ['inscription', '/inscription'],
  ['mot de passe oublié', '/mot-de-passe-oublie'],
  ['nouveau mot de passe', '/nouveau-mot-de-passe'],
  ['vérification e-mail', '/verifier-email'],
  ['page d’erreur', '/page-qui-n-existe-pas'],

  /* Zone publique v1 (ZP-1). Ces deux écrans sont PUBLICS et leurs données
   * viennent de la fixture servie par le BFF, pas de Laravel : ils sont donc
   * auditables en intégration continue, contrairement aux cinq écrans de
   * catalogue. Le slug est celui d'une annonce de la fixture, stable par
   * construction — si la fixture change, l'audit le dira en 404. */
  ['opportunités', '/opportunites'],
  ['opportunités · par filière', '/opportunites?vue=filiere'],
  ['fiche d’annonce', '/opportunites/administrateur-3eme-grade-session-juin-2026-b9b519'],
]

/**
 * Les six écrans de la boucle candidat. Ils exigent une session, donc des
 * cookies : `auditer.mjs` n'en pose pas, et les visiter sans session mesurerait
 * l'écran de connexion six fois. Ils sont audités par
 * `scripts/recette-front3.mjs`, qui se connecte — et leur URL dépend d'une
 * tentative réelle, qu'aucune liste statique ne peut connaître.
 */
const ECRANS_SOUS_SESSION = [
  'E1 tableau de bord', 'E2 diagnostic', 'E3 passation',
  'E4 correction', 'E5 maîtrise', 'E6 ordonnance',
]

/**
 * Sous-ensemble audité en intégration continue : les écrans dont le rendu ne
 * dépend d'AUCUNE donnée d'API.
 *
 * Les cinq écrans de catalogue en dépendent — ils affichent des filières et des
 * spécialités servies par Laravel. La CI du frontend n'a pas de backend : les
 * y auditer mesurerait leur état vide, pas leur rendu. Ce n'est pas une
 * couverture qu'on abandonne, c'est une couverture qui appartient à un
 * environnement de recette avec sa base. `npm run audit` les couvre en local,
 * et le rapport de lot les montre.
 */
const CHEMINS_CI = new Set([
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/nouveau-mot-de-passe',
  '/verifier-email',
  '/page-qui-n-existe-pas',
  '/opportunites',
  '/opportunites?vue=filiere',
])

const LOCALES = ['fr', 'ar']

// ------------------------------------------------------------------ arguments
const argv = process.argv.slice(2)
const opt = (nom, defaut) => {
  const i = argv.indexOf('--' + nom)
  return i === -1 ? defaut : argv[i + 1]
}
const base = opt('base', process.env.BASE_URL || 'http://localhost:3000')
const largeurs = opt('largeur', '1440,390')
const selSombre = opt('sombre', null)
const chemins = argv.filter((a) => a.startsWith('/'))
const modeCi = argv.includes('--ci')

const retenus = modeCi ? ECRANS.filter(([, c]) => CHEMINS_CI.has(c)) : ECRANS

const cibles = chemins.length
  ? chemins.map((c) => [c, c])
  : retenus.flatMap(([nom, chemin]) =>
      LOCALES.map((l) => [`${nom} · ${l}`, `/${l}${chemin === '/' ? '' : chemin}`]),
    )

if (modeCi) {
  const exclus = ECRANS.filter(([, c]) => !CHEMINS_CI.has(c)).map(([n]) => n)
  // Une couverture réduite qu'on ne dit pas se lit comme une couverture
  // complète. On l'écrit dans le rapport, pas seulement dans un commentaire.
  console.log(`Mode CI — ${exclus.length} écran(s) NON audités, faute de backend : ${exclus.join(', ')}.\n`)
}

// ------------------------------------------------------------- orchestration
const binaire = chromium.executablePath()

console.log(`# Audit de rendu — ${cibles.length} écran(s) sur ${base}`)
console.log(`Largeurs : ${largeurs}${selSombre ? ` · bascule sombre : ${selSombre}` : ''}`)
console.log(
  `Hors de cette passe, audités sous session par scripts/recette-front3.mjs : ${ECRANS_SOUS_SESSION.join(', ')}.\n`,
)

const echecs = []
for (const [nom, chemin] of cibles) {
  const args = [AUDITEUR, base + chemin, '--largeur', largeurs, '--chromium', binaire]
  if (selSombre) args.push('--sombre', selSombre)

  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  const sortie = (r.stdout || '') + (r.stderr || '')

  // On ne garde que le corps du rapport : l'en-tête d'`auditer.mjs` répète
  // l'URL, qu'on vient d'écrire.
  const corps = sortie.split('\n').slice(1).join('\n').trim()

  console.log(`${'═'.repeat(74)}\n## ${nom} — ${chemin}\n`)
  console.log(corps || '(aucune sortie)')
  console.log()

  if (r.status !== 0) echecs.push(nom)
}

console.log('═'.repeat(74))
if (echecs.length) {
  console.log(`\n${echecs.length} écran(s) avec au moins une anomalie grave :`)
  for (const e of echecs) console.log(`  - ${e}`)
  console.log()
  process.exit(1)
}
console.log('\nAucune anomalie grave sur les écrans audités.\n')
