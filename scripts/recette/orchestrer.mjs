#!/usr/bin/env node
/**
 * orchestrer.mjs — `npm run recette`. Une seule commande, du néant au verdict.
 *
 * CE QU'ELLE FERME
 *
 * Tout ce qui a trouvé les vrais défauts de FRONT-3 et FRONT-4 se lançait à la
 * main, contre un backend démarré à la main et semé à la main. La procédure
 * vivait dans une mémoire de session ; à chaque lot, la part de ce que personne
 * ne rejoue grandissait. Elle vit maintenant dans le dépôt.
 *
 * CE QU'ELLE FAIT, DANS L'ORDRE
 *
 *   1. s'assure que PostgreSQL, Redis et Mailpit répondent
 *   2. migre le backend et sème le catalogue
 *   3. démarre l'API si elle ne tourne pas
 *   4. sème la banque de questions de recette PAR L'API de la chaîne éditoriale
 *   5. démarre le frontend s'il ne tourne pas
 *   6. prépare les deux comptes candidats
 *   7. joue TOUTES les recettes, dans l'ordre
 *
 * L'ORDRE DES ÉTAPES 3 À 5 EST UN CHOIX. Le semis passe désormais par l'API :
 * il lui faut donc une API en marche, et il vient AVANT la compilation du
 * frontend — une chaîne éditoriale cassée se voit en dix secondes plutôt
 * qu'après une minute de build inutile.
 *
 * Elle sort en code 1 AU PREMIER ÉCHEC : une recette qui échoue rend les
 * suivantes ininterprétables, puisqu'elles partagent la même base.
 *
 * Ce qu'elle démarre, elle l'arrête. Ce qu'elle a trouvé déjà en marche, elle le
 * laisse — un poste de développement a le droit d'avoir ses serveurs ouverts.
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const FRONT = resolve(ICI, '../..')
const BACKEND = process.env.BACKEND_DIR || resolve(FRONT, '../Naja7i_backend_front')

const API = process.env.API_BASE_URL || 'http://localhost:8000'
const WEB = process.env.BASE_URL || 'http://localhost:3000'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
const SORTIE = process.env.SORTIE || '/tmp/recette'
const COMPTES = `${SORTIE}-comptes.json`

const demarres = []
let etape = 0

const titre = (t) => console.log(`\n\x1b[1m── ${++etape}. ${t}\x1b[0m`)
const echouer = (message) => {
  console.error(`\n\x1b[31mÉCHEC — ${message}\x1b[0m`)
  arreter()
  process.exit(1)
}

function arreter() {
  for (const p of demarres.reverse()) {
    try {
      process.kill(-p.pid, 'SIGTERM')
    } catch {
      try {
        p.kill('SIGTERM')
      } catch { /* déjà mort */ }
    }
  }
}

process.on('SIGINT', () => {
  arreter()
  process.exit(130)
})

/** Exécute une commande, rend son code. La sortie passe au travers. */
function lancer(commande, args, options = {}) {
  const r = spawnSync(commande, args, { stdio: 'inherit', ...options })
  return r.status ?? 1
}

function lancerEnFond(commande, args, options = {}) {
  const p = spawn(commande, args, { stdio: 'ignore', detached: true, ...options })
  p.unref()
  demarres.push(p)
  return p
}

async function repond(url, essais = 60, delai = 1000) {
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url, { redirect: 'manual' })
      if (r.status < 500) return true
    } catch { /* pas encore */ }
    await new Promise((r) => setTimeout(r, delai))
  }
  return false
}

// ─────────────────────────────────────────────────────────── préalables
titre('Services (PostgreSQL, Redis, Mailpit)')

if (!existsSync(BACKEND)) {
  echouer(
    `dépôt backend introuvable : ${BACKEND}\n`
      + '  Clonez optimgov/Naja7i_backend_front à côté du frontend, ou posez BACKEND_DIR.',
  )
}

if (!(await repond(`${MAILPIT}/api/v1/messages?limit=1`, 3, 500))) {
  console.log('  Mailpit ne répond pas — démarrage de docker compose côté backend')
  if (lancer('docker', ['compose', 'up', '-d'], { cwd: BACKEND }) !== 0) {
    echouer('docker compose up a échoué. PostgreSQL, Redis et Mailpit sont requis.')
  }
  if (!(await repond(`${MAILPIT}/api/v1/messages?limit=1`, 60))) {
    echouer('Mailpit ne répond toujours pas après démarrage.')
  }
}
console.log('  ok')

// ────────────────────────────────────────────── migrations et catalogue
titre('Migrations et catalogue')

if (!existsSync(`${BACKEND}/.env`)) {
  echouer(`${BACKEND}/.env est absent. Copiez .env.example et lancez php artisan key:generate.`)
}

const env = { ...process.env, OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES' }

if (lancer('php', ['artisan', 'migrate', '--force'], { cwd: BACKEND, env }) !== 0) {
  echouer('les migrations ont échoué')
}

/*
 * `CatalogueSeeder` n'est PAS idempotent : relancé sur une base déjà semée, il
 * viole `filieres_slug_unique`. C'est une propriété du backend, qu'on ne
 * modifie pas depuis ici — on ne l'appelle donc que sur une base vierge.
 *
 * En intégration continue la base est neuve à chaque exécution : le semis y a
 * toujours lieu. Sur un poste, il n'a lieu qu'une fois.
 */
const compteFilieres = spawnSync(
  'php',
  ['artisan', 'tinker', '--execute', 'echo \\DB::table("filieres")->count();'],
  { cwd: BACKEND, env, encoding: 'utf8' },
)

const dejaSeme = /(\d+)\s*$/.test((compteFilieres.stdout ?? '').trim())
  && Number((compteFilieres.stdout ?? '').trim().match(/(\d+)\s*$/)[1]) > 0

if (dejaSeme) {
  console.log('  catalogue déjà semé — on ne rejoue pas CatalogueSeeder, il n’est pas idempotent')
} else if (lancer('php', ['artisan', 'db:seed', '--force'], { cwd: BACKEND, env }) !== 0) {
  echouer('le semis du catalogue a échoué')
}

// ────────────────────────────────────────────────────────────────── API
titre('API')

if (!(await repond(`${API}/up`, 2, 500))) {
  console.log('  API absente — démarrage de php artisan serve')
  lancerEnFond('php', ['artisan', 'serve', '--port=8000'], { cwd: BACKEND, env })
  if (!(await repond(`${API}/up`))) echouer("l'API n'a pas démarré")
} else {
  console.log('  API déjà en marche')
}

// ─────────────────────────────────────────────────────── banque de recette
/*
 * DEUX ÉTAPES, ET LA FRONTIÈRE EST CELLE DE L'API.
 *
 * `preparer-referentiel.php` ne crée que ce qui n'a AUCUNE route : les comptes
 * éditoriaux et leurs rôles, les remédiations, l'uuid de la source. Il écrit un
 * fichier de passation et ne touche pas aux questions.
 *
 * `semer-banque.mjs` fait tout le reste par l'API de la chaîne éditoriale
 * (PAS-33) — c'est la bascule annoncée au D-F40. Le semis éprouve donc la
 * chaîne à chaque exécution : deux gardes pour une.
 */
titre('Banque de questions de recette')

/* Le premier fichier écrit sous `SORTIE` : c'est ici que le dossier doit
 * exister, pas à l'étape des comptes. */
mkdirSync(dirname(SORTIE), { recursive: true })

const REFERENTIEL = `${SORTIE}-referentiel.json`

if (
  lancer('php', ['artisan', 'tinker', `${ICI}/preparer-referentiel.php`], {
    cwd: BACKEND,
    env: { ...env, REFERENTIEL_FICHIER: REFERENTIEL },
  }) !== 0
) {
  echouer('la préparation du référentiel éditorial a échoué')
}

if (
  lancer('node', ['scripts/recette/semer-banque.mjs'], {
    cwd: FRONT,
    env: { ...process.env, API_BASE_URL: API, REFERENTIEL_FICHIER: REFERENTIEL },
  }) !== 0
) {
  echouer('le semis de la banque par l’API a échoué')
}

// ───────────────────────────────────────────────────────────────── frontend
titre('Frontend')

if (!(await repond(`${WEB}/fr/connexion`, 2, 500))) {
  console.log('  frontend absent — démarrage')
  const enDev = process.env.RECETTE_DEV === '1'
  if (enDev) {
    lancerEnFond('npm', ['run', 'dev'], { cwd: FRONT, env: { ...process.env, API_BASE_URL: API } })
  } else {
    if (lancer('npm', ['run', 'build'], { cwd: FRONT, env: { ...process.env, API_BASE_URL: API } }) !== 0) {
      echouer('la compilation du frontend a échoué')
    }
    lancerEnFond('node', ['.output/server/index.mjs'], {
      cwd: FRONT,
      env: { ...process.env, API_BASE_URL: API, NITRO_PORT: '3000' },
    })
  }
  if (!(await repond(`${WEB}/fr/connexion`))) echouer("le frontend n'a pas démarré")
} else {
  console.log('  frontend déjà en marche')
}

// ──────────────────────────────────────────────────────────────── comptes
titre('Comptes candidats')

if (
  lancer('node', ['scripts/recette/preparer-comptes.mjs'], {
    cwd: FRONT,
    env: { ...process.env, API_BASE_URL: API, MAILPIT_URL: MAILPIT, COMPTES_FICHIER: COMPTES },
  }) !== 0
) {
  echouer('la préparation des comptes a échoué')
}

const comptes = JSON.parse(readFileSync(COMPTES, 'utf8'))

const A = comptes.find((c) => c.cle === 'A')
const B = comptes.find((c) => c.cle === 'B')

// ─────────────────────────────────────────────────────────────── recettes
/*
 * L'ORDRE COMPTE, et il n'est pas arbitraire :
 *
 *   passation   ouvre une série et la mène jusqu'à la correction — elle crée
 *               l'historique dont les suivantes ont besoin ;
 *   front3      éprouve les refus et la restitution sur cet historique ;
 *   front4      l'entraînement et les révisions, qui naissent des erreurs ;
 *   file-envoi  en dernier : elle met délibérément la file en échec, et laisse
 *               une entrée refusée derrière elle.
 */
const RECETTES = [
  ['passation d’un diagnostic', 'scripts/recette-passation.mjs', [A.email, A.motDePasse]],
  ['FRONT-3 — les cas qui doivent échouer', 'scripts/recette-front3.mjs', [A.email, A.motDePasse]],
  ['FRONT-4 — la boucle quotidienne', 'scripts/recette-front4.mjs', [A.email, A.motDePasse]],
  [
    'file d’envoi — BLOC-4, BLOC-5 et SSR',
    'scripts/recette-file-envoi.mjs',
    [A.email, A.motDePasse, B.email, B.motDePasse],
  ],
]

/*
 * PAUSE ENTRE LES RECETTES — imposée par le produit, pas par un caprice.
 *
 * `me/diagnostics` et `me/training` portent `throttle:10,1`. Quatre recettes
 * enchaînées ouvrent bien plus de dix séries par minute : la deuxième a reçu un
 * 429 dès le premier essai de cette commande.
 *
 * On attend donc la fenêtre. Relever la limite côté backend pour faire passer
 * la recette reviendrait à modifier le produit pour qu'il ressemble au test —
 * exactement ce que D-F39 interdit. La limite est correcte ; c'est
 * l'enchaînement qui doit s'y plier.
 */
const FENETRE_THROTTLE = Number(process.env.RECETTE_PAUSE ?? 65)

const depart = Date.now()
const bilan = []
let attente = 0

for (const [i, [nom, script, args]] of RECETTES.entries()) {
  /* La pause précède AUSSI la première recette. Deux exécutions rapprochées de
   * `npm run recette` se marchent dessus autrement : la seconde hérite du
   * budget consommé par la première et échoue sur un 429 dès l'ouverture. Une
   * commande de recette doit être rejouable sans qu'on ait à compter les
   * minutes depuis la précédente. */
  if (FENETRE_THROTTLE > 0) {
    const quoi = i === 0 ? 'avant de commencer' : 'entre deux recettes'
    console.log(`\n  (pause de ${FENETRE_THROTTLE} s — limitation de débit, ${quoi})`)
    await new Promise((r) => setTimeout(r, FENETRE_THROTTLE * 1000))
    attente += FENETRE_THROTTLE
  }

  titre(nom)
  const t0 = Date.now()
  const code = lancer('node', [script, ...args], {
    cwd: FRONT,
    env: { ...process.env, BASE_URL: WEB, API_BASE_URL: API, SORTIE: `${SORTIE}-${script.split('/').pop()}` },
  })
  const duree = Math.round((Date.now() - t0) / 1000)
  bilan.push({ nom, code, duree })

  if (code !== 0) {
    console.log(`\n\x1b[1mBilan\x1b[0m`)
    for (const b of bilan) console.log(`  ${b.code === 0 ? 'ok  ' : '✗   '}${b.nom} — ${b.duree} s`)
    echouer(`« ${nom} » a échoué. Les suivantes ne sont pas jouées : elles partagent la même base.`)
  }
}

const total = Math.round((Date.now() - depart) / 1000)

console.log('\n\x1b[1m── Bilan\x1b[0m')
for (const b of bilan) console.log(`  ok  ${b.nom} — ${b.duree} s`)
console.log(
  `\n\x1b[32mToutes les recettes sont passées\x1b[0m — ${total} s au total, `
    + `dont ${attente} s d'attente imposée par la limitation de débit.`,
)

arreter()
process.exit(0)
