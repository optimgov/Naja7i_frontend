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
 *   6. prépare un compte candidat PAR PALIER
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

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ENVIRONNEMENT DE BASE EST DIT, JAMAIS SUPPOSÉ
 *
 * Cette recette migre et sème une base RÉELLE. Elle le faisait sans `--env` :
 * l'environnement était alors celui de `.env`, c'est-à-dire celui qu'on n'a
 * pas regardé. C'est exactement l'incident M-005 du protocole d'orchestration,
 * où un `migrate:fresh` sans environnement a écrasé la base de développement.
 *
 * La règle ne se suspend pas, elle se respecte en rendant l'environnement
 * VISIBLE : il est nommé ici, écrit sur chaque commande `artisan`, vérifié
 * avant la première écriture, et affiché au journal. Un opérateur qui lit la
 * sortie sait sur quelle base il vient d'écrire.
 *
 * `BACKEND_ENV` permet d'en viser un autre sans toucher au script — c'est le
 * même geste que `BACKEND_DIR` juste au-dessus.
 */
const ENV_BACKEND = process.env.BACKEND_ENV || 'local'

/** Une commande artisan, avec son environnement écrit dessus. */
const artisan = (...args) => ['artisan', ...args, `--env=${ENV_BACKEND}`]

const API = process.env.API_BASE_URL || 'http://localhost:8000'
const WEB = process.env.BASE_URL || 'http://localhost:3000'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
const SORTIE = process.env.SORTIE || '/tmp/recette'
const COMPTES = `${SORTIE}-comptes.json`

/*
 * L'ÉPREUVE DE RECETTE, nommée UNE FOIS.
 *
 * Elle était écrite en dur dans les préparations et laissée au défaut dans les
 * scripts — deux endroits pour un même fait, qui n'attendaient que de diverger.
 * C'est celle que sème `semer-banque.mjs`.
 */
const EPREUVE = process.env.CODE_EPREUVE || 'CRMEF-FR-SPEC-2025'

/*
 * L'HORODATAGE DE L'EXÉCUTION, posé une fois et partagé.
 *
 * Les comptes dont LE PALIER SE CONSOMME sont neufs à chaque passage : celui du
 * chemin de revenu, parce que la conversion est irréversible, et ceux d'essai,
 * parce que l'enveloppe gratuite vaut quarante questions et ne se renouvelle
 * pas. L'horodatage vient d'ICI et non du script qui les crée, pour qu'ils
 * portent tous le même et se reconnaissent ensemble dans la base.
 */
const HORODATAGE = String(Date.now())

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

/**
 * Une préparation par `php artisan tinker`, DONT ON LIT LA SORTIE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CODE DE SORTIE NE VAUT RIEN ICI, ET ÇA S'EST PAYÉ
 *
 * `tinker` rend 0 même quand le script qu'on lui donne lève une exception. Une
 * préparation cassée passait donc pour réussie : `remettre-quota.php` appelait
 * une relation inexistante (`Response::attemptItem`), l'exception s'affichait
 * au milieu du journal, et l'orchestrateur enchaînait.
 *
 * Ce qui en découlait est exactement le défaut que ce dépôt traque : le
 * compteur ÉTAIT effacé — la ligne précède le point de rupture — mais les
 * réponses déjà payées gardaient `cause_revealed = true`. FRONT-3 mesurait
 * donc un mur à demi ouvert, et restait vert.
 *
 * On lit ce que le script a ÉCRIT. Les scripts de recette disent « ÉCHEC »
 * quand ils échouent ; une exception, elle, se reconnaît à son nom.
 */
function preparer(fichier, envSupp = {}) {
  const r = spawnSync('php', artisan('tinker', `${ICI}/${fichier}`), {
    cwd: BACKEND,
    encoding: 'utf8',
    env: { ...env, ...envSupp },
  })

  const sortie = ((r.stdout ?? '') + (r.stderr ?? '')).trim()
  if (sortie) console.log(sortie)

  /* Un script muet n'a rien fait : tous annoncent ce qu'ils ont posé, et c'est
   * la seule preuve qu'ils sont allés au bout. `Crashing` couvre l'abandon
   * d'ObjC sur macOS, qui ne lève aucune exception PHP. */
  const casse = sortie === '' || /Exception|Fatal|ÉCHEC|Crashing|\bError\b/i.test(sortie)

  return (r.status ?? 1) === 0 && !casse ? 0 : 1
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

/*
 * ON VÉRIFIE L'ENVIRONNEMENT AVANT LA PREMIÈRE ÉCRITURE, et on l'affiche.
 *
 * `artisan env` ne touche à rien et dit ce que Laravel a résolu. Si le nom
 * qu'on lui a passé n'est pas celui qu'il annonce, on s'arrête : mieux vaut
 * refuser que migrer une base qu'on n'a pas nommée. C'est le contrôle qui
 * manquait à M-005.
 */
const resolu = spawnSync('php', artisan('env'), { cwd: BACKEND, env, encoding: 'utf8' })
const nomResolu = ((resolu.stdout ?? '') + (resolu.stderr ?? '')).match(/\[([^\]]+)\]/)?.[1]

if (nomResolu !== ENV_BACKEND) {
  echouer(
    `l'environnement backend résolu est [${nomResolu ?? 'illisible'}] alors que la recette`
    + ` vise [${ENV_BACKEND}]. Rien n'a été écrit.`,
  )
}

console.log(`  environnement backend : ${ENV_BACKEND} (écrit sur chaque commande artisan)`)

if (lancer('php', artisan('migrate', '--force'), { cwd: BACKEND, env }) !== 0) {
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
  artisan('tinker', '--execute', 'echo \\DB::table("filieres")->count();'),
  { cwd: BACKEND, env, encoding: 'utf8' },
)

const dejaSeme = /(\d+)\s*$/.test((compteFilieres.stdout ?? '').trim())
  && Number((compteFilieres.stdout ?? '').trim().match(/(\d+)\s*$/)[1]) > 0

if (dejaSeme) {
  console.log('  catalogue déjà semé — on ne rejoue pas CatalogueSeeder, il n’est pas idempotent')

  /*
   * MAIS `PlansSeeder`, LUI, EST IDEMPOTENT — deux `updateOrCreate` sur `code`
   * — et il porte la composition arbitrée des trois paliers (D-CAT, lot 3A.9) :
   * les noms « Entrée / Préparation / Session complète » et les capacités que
   * chaque offre ouvre.
   *
   * Une base semée AVANT cet arbitrage garde « Découverte — 7 jours » et
   * l'ancienne composition. La recette mesurerait alors l'écran sur un
   * catalogue périmé, et le verrait juste. On rejoue donc ce semis-là, et lui
   * seul : il ne réécrit aucune commande passée — le modèle `Plan` compose une
   * version neuve pour toute modification contractuelle.
   */
  if (lancer('php', artisan('db:seed', '--class=PlansSeeder', '--force'), { cwd: BACKEND, env }) !== 0) {
    echouer('le semis des offres (PlansSeeder, idempotent) a échoué')
  }
} else if (lancer('php', artisan('db:seed', '--force'), { cwd: BACKEND, env }) !== 0) {
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
  /* Le PORT vient de `API_BASE_URL`, il n'est plus écrit ici. Le script
   * acceptait déjà qu'on vise une autre API par cette variable, puis démarrait
   * la sienne sur 8000 quoi qu'il arrive : viser un autre port ne pouvait que
   * mener à `repond()` sur un serveur qui n'existait pas. */
  lancerEnFond('php', artisan('serve', `--port=${new URL(API).port || '8000'}`), {
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
  lancer('php', artisan('tinker', `${ICI}/preparer-referentiel.php`), {
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
      /* Même correction que pour l'API : le port vient de `BASE_URL`. */
      env: { ...process.env, API_BASE_URL: API, NITRO_PORT: new URL(WEB).port || '3000' },
    })
  }
  if (!(await repond(`${WEB}/fr/connexion`))) echouer("le frontend n'a pas démarré")
} else {
  console.log('  frontend déjà en marche')
  await verifierQueLeFrontendEstCeluiDuDepot()
}

/**
 * LE FRONTEND TROUVÉ EN MARCHE EST-IL CELUI QU'ON VIENT D'ÉCRIRE ?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE VÉRIFICATION FERME, ET CE QU'ELLE A COÛTÉ
 *
 * « Ce qu'elle a trouvé déjà en marche, elle le laisse » est une bonne règle :
 * un poste de développement a le droit d'avoir ses serveurs ouverts. Mais elle
 * portait une conséquence que personne n'avait écrite — la recette mesurait
 * alors le serveur, pas le dépôt.
 *
 * Constaté au lot M-009, et ce n'est pas une hypothèse : un
 * `node .output/server/index.mjs` démarré DEUX JOURS plus tôt répondait sur le
 * port 3000. La recette l'a mesuré, ZP-1 a rougi sur un défaut du bloc de
 * démonstration corrigé depuis, et le même ZP-1 passait sur la compilation du
 * jour. Une recette qui échoue sur du code qu'on n'a pas écrit fait perdre
 * exactement le temps qu'elle existe pour économiser — et, dans l'autre sens,
 * une recette VERTE sur un serveur périmé est bien pire : elle certifie un lot
 * qu'elle n'a jamais exécuté.
 *
 * C'est la leçon que ce chantier a apprise trois fois en un jour, appliquée à
 * l'orchestrateur lui-même : un contrôle qui ne peut pas rougir ne prouve rien.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * COMMENT
 *
 * Nuxt écrit l'identifiant de compilation dans `.output/public/_nuxt/builds/
 * latest.json`, et le sert dans la charge utile de chaque page. Les deux
 * doivent coïncider. C'est un test d'identité, pas de fraîcheur : il ne se
 * trompe ni sur une horloge, ni sur un fuseau, ni sur un fichier retouché.
 *
 * On s'ARRÊTE plutôt que d'avertir. Un avertissement au milieu de deux cents
 * lignes de journal n'est lu qu'après coup, quand on cherche déjà pourquoi le
 * résultat est incompréhensible.
 *
 * En mode `RECETTE_DEV`, `.output` n'existe pas : `npm run dev` recompile à
 * chaud, la question ne se pose pas, et l'absence du fichier suffit à le dire.
 */
async function verifierQueLeFrontendEstCeluiDuDepot() {
  const marque = `${FRONT}/.output/public/_nuxt/builds/latest.json`

  if (!existsSync(marque)) {
    console.log('  (pas de compilation dans .output — serveur de développement supposé, identité non vérifiable)')
    return
  }

  let attendu
  try {
    attendu = JSON.parse(readFileSync(marque, 'utf8')).id
  } catch {
    echouer(`${marque} est illisible : impossible de savoir quelle compilation le serveur sert.`)
  }

  let servi
  try {
    const page = await (await fetch(`${WEB}/fr/connexion`)).text()
    servi = page.match(/buildId\s*:\s*"([^"]+)"/)?.[1]
  } catch {
    servi = undefined
  }

  if (!servi) {
    echouer(
      'le frontend en marche ne déclare aucun identifiant de compilation :'
      + ' impossible de vérifier qu\'il sert le code de ce dépôt.',
    )
  }

  if (servi !== attendu) {
    echouer(
      `le frontend en marche sur ${WEB} sert la compilation ${servi}, alors que`
      + ` .output contient ${attendu}. Il a été démarré avant vos modifications :`
      + ' la recette mesurerait un autre code que le vôtre. Arrêtez-le et relancez,'
      + ' ou visez le vôtre avec BASE_URL.',
    )
  }

  console.log(`  compilation servie vérifiée : ${servi}`)
}

// ──────────────────────────────────────────────────────────────── comptes
titre('Comptes candidats')

if (
  lancer('node', ['scripts/recette/preparer-comptes.mjs'], {
    cwd: FRONT,
    env: {
      ...process.env,
      API_BASE_URL: API,
      MAILPIT_URL: MAILPIT,
      COMPTES_FICHIER: COMPTES,
      HORODATAGE_RECETTE: HORODATAGE,
    },
  }) !== 0
) {
  echouer('la préparation des comptes a échoué')
}

const comptes = JSON.parse(readFileSync(COMPTES, 'utf8'))

const parCle = (cle) => {
  const c = comptes.find((x) => x.cle === cle)
  if (!c) echouer(`le compte « ${cle} » n'a pas été préparé`)
  return c
}

const PASSATION = parCle('PASSATION')
const REFUS = parCle('REFUS')
const FILE = parCle('FILE')
const FILE_2 = parCle('FILE_2')
const ENTREE = parCle('ENTREE')
const SESSION = parCle('SESSION')
const CONVERSION = parCle('CONVERSION')

/**
 * POSER LE PALIER D'UN COMPTE, ET ÉCHOUER SI ON N'Y ARRIVE PAS.
 *
 * `poser-le-palier.php` achète par la vraie chaîne — coupon, `CouponGateway`,
 * `AbonnementService` — et relit les capacités obtenues avant de rendre la
 * main. Il est idempotent : un compte qui porte déjà le palier n'est pas
 * réacheté.
 */
const palier = (compte) =>
  preparer('poser-le-palier.php', { COMPTE_EMAIL: compte.email, PALIER: compte.palier })

/**
 * DONNER À UN COMPTE LE PASSÉ QUE SON SCÉNARIO EXIGE.
 *
 * Une ordonnance et un calendrier mémoire naissent des réponses d'une série
 * passée. Avec un compte par palier, le compte de FRONT-4 est neuf : il faut
 * lui poser ce passé plutôt que de l'hériter d'un scénario joué plus tôt.
 */
const amorcer = (compte, exigence = 'cause-diagnostiquee') =>
  lancer('node', ['scripts/recette/amorcer-un-passe.mjs'], {
    cwd: FRONT,
    env: {
      ...env,
      API_BASE_URL: API,
      COMPTE_EMAIL: compte.email,
      COMPTE_MDP: compte.motDePasse,
      CODE_EPREUVE: EPREUVE,
      /* CE QUE LE SCÉNARIO ATTEND DU PASSÉ, dit par lui.
       *
       * FRONT-4 a besoin d'un rendez-vous mémoire, qui exige une cause
       * étiquetée sur le distracteur choisi. Le chemin de revenu, lui, n'a
       * besoin que d'une correction verrouillable — `cause_locked` se lit sur
       * « fausse, et non révélée », sans cause étiquetée. Confondre les deux
       * ferait échouer le second sur une exigence qui n'est pas la sienne. */
      EXIGENCE: exigence,
    },
  })

/** Enchaîne des préparations, et s'arrête à la première qui échoue. */
const enchainer = (...etapes) => () => {
  for (const etape of etapes) {
    const code = etape()
    if (code !== 0) return code
  }
  return 0
}

// ─────────────────────────────────────────────────────────────── recettes
/*
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE RECETTE MESURE UN PALIER, PAS UN COMPTE — M-016
 *
 * Chaque entrée DÉCLARE le palier qu'elle éprouve, et ce palier est POSÉ avant
 * qu'elle ne s'exécute. Ce n'était pas le cas : le palier était ce que les
 * scénarios précédents avaient laissé au compte A, c'est-à-dire un état que
 * personne n'écrivait nulle part.
 *
 * Depuis les murs du lot 3A.9, cet implicite était devenu faux. FRONT-4,
 * l'examen blanc et la file d'envoi jouaient sur un compte d'ESSAI des
 * fonctions PAYANTES. FRONT-4 ne rougissait même pas : il plantait sur un
 * champ absent, et l'on ne savait pas si c'était le lot ou la donnée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ORDRE N'EST PLUS UNE CONDITION DE JUSTESSE
 *
 * Il l'était de deux façons, et les deux sont tombées :
 *
 *   · « l'abonnement en dernier », parce qu'ouvrir l'abonnement de A aurait
 *     fait mesurer aux suivantes un mur déjà tombé. Ce scénario a désormais
 *     SON compte, neuf à chaque exécution — il ne peut plus contaminer
 *     personne, et sa place dans la liste n'a plus d'importance ;
 *   · l'historique de la passation, dont FRONT-4 héritait. `amorcer()` le pose.
 *
 * UNE TROISIÈME EST TOMBÉE APRÈS COUP, et elle ne se voyait pas : les
 * scénarios d'essai se partageaient UNE enveloppe de quarante questions. Celui
 * qui passait en premier prenait le budget des autres — un ordre implicite, et
 * le plus dangereux des trois puisque rien ne le nommait. Chaque palier d'essai
 * a maintenant son compte, neuf à chaque exécution : il n'y a plus de budget
 * commun à se disputer. Voir `preparer-comptes.mjs`.
 *
 * Ce qui subsiste n'est plus une condition de justesse mais de LISIBILITÉ : la
 * zone publique en premier parce qu'un échec du tapis n'a rien à voir avec un
 * candidat, et la file d'envoi en dernier parce qu'elle laisse délibérément une
 * entrée refusée derrière elle. Aucune des deux ne rendrait une autre recette
 * fausse si on la déplaçait.
 */
const RECETTES = [
  /*
   * LA ZONE PUBLIQUE EN PREMIER, et sans compte.
   *
   * Elle ne demande ni session ni backend : ses données viennent de la fixture
   * servie par le BFF. La jouer avant les recettes authentifiées la rend
   * lisible isolément — un échec du tapis n'a rien à voir avec l'état d'un
   * candidat, et l'ordre le dit.
   */
  {
    nom: 'zone publique — ZP-1',
    script: 'scripts/recette-zone-publique.mjs',
    palier: 'aucun — visiteur sans compte',
  },
  /*
   * LE CONTRASTE DES ÉTATS INTERACTIFS, juste après, et pour la même raison :
   * il ne demande aucune session. `--complet` lui ouvre les écrans de catalogue
   * — l'API est en marche à ce point de l'orchestration, ce qui n'est pas le
   * cas en intégration continue, où le script se restreint de lui-même et le
   * DIT.
   *
   * Il complète `npm run audit`, qui mesure les écrans AU REPOS : un survol et
   * un focus changent des couleurs que cet audit-là ne voit jamais.
   */
  {
    nom: 'contraste des états interactifs',
    script: 'scripts/recette-contraste-interactif.mjs',
    args: ['--complet'],
    palier: 'aucun — visiteur sans compte',
  },
  /*
   * LES PORTES partent d'un compte qui n'existe pas encore et le mènent de
   * l'inscription à la question miroir. Elle N'UTILISE AUCUN compte préparé,
   * précisément parce que son premier contrôle exige un compte à ZÉRO
   * tentative — qu'un compte déjà travaillé ne pourrait plus produire. Elle
   * s'inscrit elle-même, et mesure donc le palier que l'inscription donne.
   */
  {
    nom: 'les portes — PORTE-1 à PORTE-7',
    script: 'scripts/recette-portes.mjs',
    palier: 'essai — le compte s’inscrit lui-même pendant le scénario',
  },
  {
    nom: 'passation d’un diagnostic',
    script: 'scripts/recette-passation.mjs',
    compte: PASSATION,
    palier: 'essai (compte neuf) — répondre aux questions est le seul droit du gratuit',
  },
  /*
   * FRONT-3 ÉPROUVE LES REFUS : elle a besoin du mur DEBOUT, donc du palier
   * gratuit. Sur un compte payant, elle mesurerait des portes ouvertes en
   * croyant mesurer des portes fermées.
   *
   * LE QUOTA F03 EST REMIS À NEUF AVANT ELLE. Il est CUMULATIF par conception
   * et ne se remet jamais à zéro : sur un poste, le compte épuise ses deux
   * unités à la première exécution ; en CI la base est neuve et il les a
   * toutes. La recette mesurait donc deux choses selon la machine — même
   * défaut que le calendrier au D-F49.
   */
  {
    nom: 'FRONT-3 — les cas qui doivent échouer',
    script: 'scripts/recette-front3.mjs',
    compte: REFUS,
    palier: 'essai (compte neuf) — le mur doit être DEBOUT pour qu’on mesure sa fermeture',
    avant: (c) => enchainer(
      () => palier(c),
      () => preparer('remettre-quota.php', { COMPTE_EMAIL: c.email }),
    ),
  },
  /*
   * FRONT-4 EST LA BOUCLE QUOTIDIENNE, ET ELLE EST PAYANTE.
   *
   * Entraînement ciblé (`series.targeted`), séance mémoire (`memory.sessions`)
   * et ordonnance (`remediation.plan`) : seule « Session complète » compose les
   * trois depuis l'arbitrage D-CAT. C'est le scénario que l'implicite avait le
   * plus abîmé — il jouait sur un compte d'essai, et plantait.
   *
   * Trois préparations, dans cet ordre, et chacune échoue bruyamment :
   *   1. le palier, sans quoi rien n'est ouvert ;
   *   2. le PASSÉ — une erreur commise avec certitude, sans quoi l'ordonnance
   *      est vide et le calendrier aussi ;
   *   3. l'ÉCHÉANCE reculée. Un rendez-vous naît au palier 1, `due_on` =
   *      demain : sur une base neuve RIEN n'est jamais échu, et la recette
   *      mesurerait « 0 échus » puis un clic dans le vide (D-F49).
   */
  {
    nom: 'FRONT-4 — la boucle quotidienne',
    script: 'scripts/recette-front4.mjs',
    compte: SESSION,
    palier: 'session-180j — la boucle quotidienne est payante depuis D-CAT',
    avant: (c) => enchainer(
      () => palier(c),
      () => amorcer(c),
      () => preparer('echoir-revisions.php', { COMPTE_EMAIL: c.email, CODE_EPREUVE: EPREUVE }),
    ),
  },
  /*
   * L'EXAMEN BLANC MESURE LE SOCLE, PAS LA PROFONDEUR.
   *
   * `simulator.full` est composée par les TROIS offres payantes. On prend donc
   * la plus petite — « Entrée » — et c'est un choix de mesure : si le socle
   * suffit, on le prouve ; le mesurer sur « Session complète » laisserait
   * croire que l'examen blanc demande la profondeur.
   */
  {
    nom: 'examen blanc — E9, E10, E11',
    script: 'scripts/recette-simulation.mjs',
    compte: ENTREE,
    palier: 'decouverte-7j — `simulator.full` est dans le socle payant, pas dans la profondeur',
  },
  /*
   * LA FILE D'ENVOI EN DERNIER, et c'est de la lisibilité, pas de la justesse :
   * elle met délibérément la file en échec et laisse une entrée refusée
   * derrière elle.
   *
   * SON PROPRIÉTAIRE EST AU SOCLE PAYANT, ET C'EST UNE MESURE, PAS UN CONFORT.
   * Elle ouvre HUIT séries de cinq — quarante unités, l'enveloppe d'essai
   * exactement, sans une de marge. Constaté : sur un compte d'essai elle rougit
   * sur `ENVELOPPE_EPUISEE` à la septième, c'est-à-dire pour une raison qui ne
   * dit rien sur la file. Or aucune de ses assertions ne regarde un mur — ce
   * qu'elle éprouve est le PROPRIÉTAIRE d'une file. On lui donne donc le plus
   * petit palier dont l'enveloppe est illimitée, et l'on retire de son verdict
   * la seule cause d'échec qui lui soit étrangère.
   *
   * L'INTRUSE RESTE EN ESSAI : elle se connecte, échoue à écouler la file d'un
   * autre, et repart sans répondre à rien. Une identité ordinaire est
   * exactement ce que ce cas demande.
   */
  {
    nom: 'file d’envoi — BLOC-4, BLOC-5 et SSR',
    script: 'scripts/recette-file-envoi.mjs',
    compte: FILE,
    second: FILE_2,
    palier: 'decouverte-7j (propriétaire) + essai (intruse) — la propriété d’une file, jamais un droit',
    avant: (c) => enchainer(() => palier(c), () => palier(FILE_2)),
  },
  /*
   * LE CHEMIN DE REVENU, SUR UN COMPTE NEUF À CHAQUE EXÉCUTION.
   *
   * Il CONVERTIT — et la conversion est irréversible (ADR-0033). Le rejouer sur
   * un compte fixe mesurerait, dès la deuxième exécution, un compte déjà
   * converti : l'inverse exact de ce qu'il éprouve. Son compte neuf est aussi
   * ce qui a permis de retirer l'invariant « en dernier ».
   *
   * Il lui faut un passé — « la cause est fermée avant » se lit sur une
   * correction — et un quota ÉPUISÉ, sans quoi la première erreur ouvrirait sa
   * cause avec le quota gratuit et l'on conclurait « le mur est tombé » en
   * n'ayant mesuré que la gratuité.
   */
  {
    nom: 'abonnement — le chemin de revenu',
    script: 'scripts/recette-abonnement.mjs',
    compte: CONVERSION,
    palier: 'essai → actif (compte neuf) — c’est la CONVERSION qu’il mesure',
    avant: (c) => enchainer(
      () => palier(c),
      () => amorcer(c, 'erreur-certaine'),
      () => preparer('epuiser-quota.php', { COMPTE_EMAIL: c.email }),
    ),
  },
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

for (const [i, scenario] of RECETTES.entries()) {
  const { nom, script, compte, second, palier: palierDit } = scenario

  /*
   * LES ARGUMENTS SE DÉDUISENT DU COMPTE, ils ne se recopient plus.
   *
   * Chaque script prend `<email> <motDePasse>`, et la file d'envoi une seconde
   * identité. Les épeler à chaque entrée était la porte ouverte à ce que le
   * lot corrige : un scénario dont on croit lire le compte, et qui en reçoit
   * un autre.
   */
  const args = scenario.args ?? [
    ...(compte ? [compte.email, compte.motDePasse] : []),
    ...(second ? [second.email, second.motDePasse] : []),
  ]

  const options = scenario.avant && compte ? { avant: scenario.avant(compte) } : {}

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

  /*
   * LE PALIER SE DIT AVANT LA MESURE, et il se dit à voix haute.
   *
   * C'est l'exigence du lot : une recette qui ne dit pas quel palier elle
   * éprouve ne prouve rien. Un opérateur qui lit ce journal sait, ligne par
   * ligne, sur quoi le verdict porte — et un scénario vert sur le mauvais
   * palier se voit ici, pas trois heures plus tard.
   */
  console.log(`  palier éprouvé : ${palierDit}`)
  if (compte) console.log(`  compte : ${compte.email}${second ? ` + ${second.email}` : ''}`)

  /* Une préparation qui échoue arrête tout : jouer la recette sur un état
   * qu'on n'a pas su poser rendrait son verdict ininterprétable. */
  if (options.avant && options.avant() !== 0) {
    echouer(`la préparation de « ${nom} » a échoué`)
  }

  /* Le palier des scénarios SANS préparation propre est posé quand même : un
   * compte réutilisé d'une exécution à l'autre doit être vérifié, pas supposé. */
  if (!options.avant && compte && palier(compte) !== 0) {
    echouer(`le palier de « ${nom} » n'a pas pu être posé sur ${compte.email}`)
  }

  const t0 = Date.now()
  const code = lancer('node', [script, ...args], {
    cwd: FRONT,
    /* `MAILPIT_URL` voyage avec les autres : la recette des portes s'inscrit
     * par le formulaire public et lit son jeton de vérification dans la boîte,
     * comme `preparer-comptes.mjs`. Le laisser au défaut du script ferait
     * diverger deux adresses de Mailpit dans la même exécution. */
    env: {
      ...process.env,
      BASE_URL: WEB,
      API_BASE_URL: API,
      MAILPIT_URL: MAILPIT,
      SORTIE: `${SORTIE}-${script.split('/').pop()}`,
    },
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
