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

/*
 * LE PROFIL DE LIMITATION SE POSE ICI, ET SEULEMENT SI C'EST NOUS QUI DÉMARRONS.
 *
 * `RATE_LIMIT_PROFILE=recette` (PAS-34 du backend) relève les seuils de
 * TRANSPORT — pas ceux de la file d'envoi, pas ceux de la sécurité. C'est ce qui
 * remplace les 260 s d'attente pure que mesurait le D-F44.
 *
 * On ne le pose pas dans le `.env` du backend : une variable d'environnement du
 * processus l'emporte sur le fichier (phpdotenv n'écrase jamais l'existant), et
 * surtout elle disparaît avec le serveur. Une recette ne doit pas laisser
 * derrière elle un backend aux limites relevées.
 *
 * SI L'API TOURNE DÉJÀ, on ne sait pas sous quel profil — et on ne le devine
 * pas. La pause du D-F44 reprend alors ses droits, et le bilan dit pourquoi.
 */
let apiSousProfilRecette = false

if (!(await repond(`${API}/up`, 2, 500))) {
  console.log('  API absente — démarrage de php artisan serve (profil de limitation : recette)')
  lancerEnFond('php', ['artisan', 'serve', '--port=8000'], {
    cwd: BACKEND,
    env: { ...env, RATE_LIMIT_PROFILE: 'recette' },
  })
  if (!(await repond(`${API}/up`))) echouer("l'API n'a pas démarré")
  apiSousProfilRecette = true
} else {
  console.log('  API déjà en marche — profil de limitation inconnu, la pause est maintenue')
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
  /*
   * LA ZONE PUBLIQUE EN PREMIER, et sans compte.
   *
   * Elle ne demande ni session ni backend : ses données viennent de la fixture
   * servie par le BFF. La jouer avant les recettes authentifiées la rend
   * lisible isolément — un échec du tapis n'a rien à voir avec l'état du
   * candidat A, et l'ordre le dit.
   */
  ['zone publique — ZP-1', 'scripts/recette-zone-publique.mjs', []],
  ['passation d’un diagnostic', 'scripts/recette-passation.mjs', [A.email, A.motDePasse]],
  ['FRONT-3 — les cas qui doivent échouer', 'scripts/recette-front3.mjs', [A.email, A.motDePasse]],
  /*
   * FRONT-4 EXIGE UN CALENDRIER ÉCHU, et il faut le lui donner.
   *
   * Un rendez-vous naît au palier 1 : `due_on` = demain. Sur un poste les
   * comptes traînent depuis des jours et tout est échu ; sur une base neuve
   * RIEN ne l'est jamais. La recette mesurait donc deux choses différentes
   * selon la machine, et la première exécution en CI l'a montré — « 0 échus »,
   * puis un clic dans le vide. Voir `echoir-revisions.php` : il recule
   * l'échéance, et elle seule.
   */
  [
    'FRONT-4 — la boucle quotidienne',
    'scripts/recette-front4.mjs',
    [A.email, A.motDePasse],
    { avant: ['php', ['artisan', 'tinker', `${ICI}/echoir-revisions.php`], {
      cwd: BACKEND,
      env: { ...env, COMPTE_EMAIL: A.email, CODE_EPREUVE: 'CRMEF-FR-SPEC-2025' },
    }] },
  ],
  /*
   * L'EXAMEN BLANC AVANT LA FILE D'ENVOI, et l'ordre n'est pas indifférent.
   *
   * La recette du simulateur laisse derrière elle une simulation EXPIRÉE — elle
   * fait exprès de dépasser l'échéance pour vérifier le refus. La file d'envoi,
   * elle, pose des entrées et met délibérément la file en échec : elle doit
   * rester la dernière, comme depuis le FRONT-5.
   */
  ['examen blanc — E9, E10, E11', 'scripts/recette-simulation.mjs', [A.email, A.motDePasse]],
  [
    'file d’envoi — BLOC-4, BLOC-5 et SSR',
    'scripts/recette-file-envoi.mjs',
    [A.email, A.motDePasse, B.email, B.motDePasse],
  ],
]

/*
 * PAUSE ENTRE LES RECETTES — désormais l'exception, plus la règle.
 *
 * CE QUE DISAIT LE D-F44, ET POURQUOI ÇA A CHANGÉ. Quatre recettes enchaînées
 * ouvrent bien plus de dix séries par minute, et `ouverture-serie` porte 10/min :
 * la deuxième recevait un 429. On attendait donc la fenêtre — 260 s d'attente
 * pure sur 521. Relever la limite « pour faire passer la recette » était refusé,
 * à juste titre : c'eût été modifier le produit pour qu'il ressemble au test.
 *
 * CE QUE LE PAS-34 A CHANGÉ. La limite n'est plus relevée « pour le test » : le
 * backend porte deux PROFILS déclarés, et le profil de recette ne touche que le
 * TRANSPORT. Ce qu'il ne relève jamais, par construction et par test :
 *
 *   - `reponse`, la route qu'écoule la file d'envoi — un vrai limiteur reste en
 *     face de la recette, parce qu'un vrai 429 y avait déjà produit un faux vert ;
 *   - `LoginThrottle` et le renvoi de vérification — de la sécurité, pas du
 *     transport, et le backend les vérifie SOUS le profil de recette.
 *
 * La garde de `recette-front4.mjs` qui refuse de lire un 429 comme un résultat
 * reste en place, et ne coûte rien tant qu'aucun 429 ne survient.
 *
 * LA PAUSE SUBSISTE POUR LE CAS OÙ ON NE MAÎTRISE PAS LE BACKEND : une API déjà
 * en marche sur un poste tourne sous un profil qu'on ne connaît pas.
 * `RECETTE_PAUSE` tranche explicitement dans les deux sens.
 */
const FENETRE_THROTTLE = process.env.RECETTE_PAUSE !== undefined
  ? Number(process.env.RECETTE_PAUSE)
  : (apiSousProfilRecette ? 0 : 65)

const depart = Date.now()
const bilan = []
let attente = 0

for (const [i, [nom, script, args, options = {}]] of RECETTES.entries()) {
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

  /* Une préparation qui échoue arrête tout : jouer la recette sur un état
   * qu'on n'a pas su poser rendrait son verdict ininterprétable. */
  if (options.avant && lancer(...options.avant) !== 0) {
    echouer(`la préparation de « ${nom} » a échoué`)
  }

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
    + (attente > 0
      ? `dont ${attente} s d'attente imposée par la limitation de débit.`
      : 'sans aucune attente de fenêtre (backend sous profil de recette).'),
)

arreter()
process.exit(0)
