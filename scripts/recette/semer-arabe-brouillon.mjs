/**
 * semer-arabe-brouillon.mjs — UNE question arabe, pour la composition seule.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CE SCRIPT N'EST PAS
 *
 * Ce n'est pas une seconde chaîne de semis. Il emprunte EXACTEMENT le circuit
 * de `semer-banque.mjs` — les trois comptes de `/tmp/recette-referentiel.json`,
 * la source déjà vérifiée par le relecteur, et la suite
 * `submit → review → validate → publish` de l'API d'administration. Aucune
 * écriture directe en base, aucune transition contournée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI IL EXISTE, ET POURQUOI SON CONTENU EST MARQUÉ
 *
 * `DemonstrationController` filtre sur `where('locale', $locale)`. La banque
 * de recette est intégralement `fr` : `?locale=ar` répond donc 404
 * `DEMO_NOT_AVAILABLE`, et le héros arabe tombe sur son repli. Le repli est
 * juste — mais il ne montre pas la composition qu'il faut juger.
 *
 * LE CONTENU N'EST PAS UNE PREUVE ÉDITORIALE, ET IL LE DIT DE LUI-MÊME.
 * L'énoncé porte le marqueur `[brouillon visuel — non publiable]` en toutes
 * lettres, en arabe et en français. Il apparaît donc À L'ÉCRAN, dans la
 * capture, et sur toute page qui servirait cette question. Un marqueur rangé
 * dans un commentaire de code n'aurait protégé personne : celui-ci se voit.
 *
 * Les captures arabes produites avec ce brouillon sont des CAPTURES DE
 * COMPOSITION. Elles montrent la mise en page, le miroir RTL et le rythme
 * typographique. Elles ne démontrent rien de la valeur pédagogique, et le
 * rapport le dit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IL NE DOIT JAMAIS ATTEINDRE LA PRÉPRODUCTION
 *
 * Deux gardes, parce qu'une seule s'oublie :
 *   · le script refuse toute API qui n'est pas locale — la cible est comparée
 *     à `localhost`/`127.0.0.1` avant le premier appel ;
 *   · l'énoncé est reconnaissable par une recherche textuelle sur le marqueur,
 *     ce qui permet de le retrouver et de le retirer sans deviner.
 *
 *   node scripts/recette/semer-arabe-brouillon.mjs
 */

import { readFileSync } from 'node:fs'

import { client, motif } from './client-api.mjs'

const API = process.env.API_BASE_URL || 'http://localhost:8000'
const REFERENTIEL = process.env.REFERENTIEL_FICHIER || '/tmp/recette-referentiel.json'
const ADMIN = '/api/v1/admin'

/** Le marqueur, en arabe puis en français : il est lu dans les deux sens. */
const MARQUEUR = '[مسودة بصرية — غير قابلة للنشر / brouillon visuel — non publiable]'

const echouer = (message) => {
  console.error(`\n  ÉCHEC — ${message}`)
  process.exit(1)
}

/*
 * GARDE 1 — cible locale obligatoire. Un `API_BASE_URL` pointant ailleurs
 * arrête le script avant la connexion, donc avant toute écriture.
 */
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) {
  echouer(`cible non locale (${API}). Ce brouillon ne doit exister qu'en local.`)
}

let referentiel
try {
  referentiel = JSON.parse(readFileSync(REFERENTIEL, 'utf8'))
} catch (e) {
  echouer(`référentiel illisible (${REFERENTIEL}) : ${e.message}\n`
    + '  Il est écrit par preparer-referentiel.php, joué par la recette.')
}

const noeud = referentiel.noeuds?.[0]
if (!noeud?.uuid) echouer('aucun nœud de compétence dans le référentiel.')

// ─────────────────────────────────────────────── les trois identités
const equipe = {}
for (const [cle, compte] of Object.entries(referentiel.comptes)) {
  equipe[cle] = client(API)
  try {
    await equipe[cle].connecter(compte.email, compte.mot_de_passe)
  } catch (e) {
    echouer(`${cle} : ${e.message}`)
  }
}
const { auteur, reviseur, editeur } = equipe

// ─────────────────────────────────────────────── l'énoncé, marqué
/*
 * Le sujet est volontairement le MÊME que celui de la démonstration française
 * — la différenciation du temps d'étayage. Traduire un item déjà écrit plutôt
 * qu'en inventer un second limite ce qui est fabriqué à la seule langue, et
 * rend la relecture éditoriale plus courte : il n'y a qu'une chose à vérifier.
 */
const ENONCE = `${MARQUEUR} في قسم متعدد المستويات، يُكلّف الأستاذ الفوج (أ) بعمل ذاتي `
  + 'بينما يقود حصة موجّهة مع الفوج (ب). ما الهدف الأساسي من هذا التدبير ؟'

const OPTIONS = [
  {
    content: 'تمييز زمن المساندة حسب حاجات المتعلمين',
    is_correct: true,
    rationale: 'التناوب بين العمل الذاتي والحصة الموجّهة يتيح تركيز المساندة حيث تلزم: '
      + 'وهذا هو التعريف الإجرائي لتمييز الزمن الديداكتيكي.',
  },
  {
    content: 'إشغال الفوج (أ) لتفادي الضجيج',
    is_correct: false,
    rationale: 'تدبير الضجيج نتيجة ممكنة وليس هدفًا ديداكتيكيًا: السؤال يتعلّق بقصد التعلّم.',
    cause: 'confusion_notions',
  },
  {
    content: 'تقويم الفوج (أ) تقويمًا إجماليًا',
    is_correct: false,
    rationale: 'العمل الذاتي غير المؤطَّر لا يستوفي شروط التقويم الإجمالي: '
      + 'تعليمات مضبوطة وشروط متكافئة.',
    cause: 'regle_mal_appliquee',
  },
  {
    content: 'تقليص برنامج الفوج (ب)',
    is_correct: false,
    rationale: 'التمييز ليس تخفيفًا للمضامين: الأهداف تبقى مشتركة، وما يتغيّر هو المسارات والدعم.',
    cause: 'lecture_enonce',
  },
]

// ─────────────────────────────────────────────── déjà semée ?
const connues = await auteur.appel(
  `${ADMIN}/questions?competency=${encodeURIComponent(noeud.code)}&locale=ar`,
)
if (connues.statut >= 400) {
  echouer(`lecture de la banque arabe refusée — ${connues.statut} ${motif(connues)}`)
}

const existante = (connues.corps?.data ?? []).find((q) => q.stem?.startsWith(MARQUEUR))

let uuid = existante?.uuid
let etat = existante?.status

if (uuid === undefined) {
  const creation = await auteur.appel(`${ADMIN}/questions`, {
    method: 'POST',
    body: {
      exam_code: referentiel.epreuve,
      competency_node_uuid: noeud.uuid,
      locale: 'ar',
      stem: ENONCE,
      explanation: 'التدبير ينظّم زمن مساندة الأستاذ: يركّز تدخّله حيث ينتج تعلّمًا، '
        + 'بينما يشتغل الفوج الآخر بمفرده على مهمّة في متناوله.',
      kind: 'qcm_single',
      difficulty: 3,
      remediation_uuid: noeud.remediation_uuid,
      source_code: referentiel.source.code,
      source_locator: 'p. 42',
      options: OPTIONS,
    },
  })

  if (creation.statut >= 400) {
    echouer(`rédaction refusée — ${creation.statut} ${motif(creation)}`)
  }

  uuid = creation.corps?.data?.uuid
  etat = creation.corps?.data?.status
  console.log('  question arabe rédigée')
} else {
  console.log(`  question arabe déjà présente (${etat})`)
}

// ─────────────────────────────────────────────── la chaîne éditoriale
const ETAPES = {
  draft: { nom: 'soumettre', client: () => auteur, action: 'submit' },
  a_verifier: { nom: 'relire', client: () => reviseur, action: 'review' },
  reviewed: { nom: 'valider', client: () => editeur, action: 'validate' },
  pedagogically_validated: {
    nom: 'publier', client: () => editeur, action: 'publish',
    corps: { for_diagnostic: true, for_simulation: false },
  },
}

for (let garde = 0; etat !== 'published'; garde++) {
  if (garde > 6) echouer(`la chaîne ne converge pas (état « ${etat} »).`)

  const etape = ETAPES[etat]
  if (etape === undefined) echouer(`état inattendu : « ${etat} ».`)

  const reponse = await etape.client().appel(
    `${ADMIN}/questions/${uuid}/${etape.action}`,
    { method: 'POST', ...(etape.corps ? { body: etape.corps } : {}) },
  )

  if (reponse.statut >= 400) {
    echouer(`${etape.nom} refusé — ${reponse.statut} ${motif(reponse)}`)
  }

  const apres = reponse.corps?.data?.status
  if (apres === etat) echouer(`${etape.nom} n'a pas fait avancer l'état.`)
  etat = apres
  console.log(`  ${etape.nom} → ${etat}`)
}

console.log('\n  Brouillon arabe publié pour le diagnostic — LOCAL UNIQUEMENT.')
console.log(`  Marqueur visible à l'écran : ${MARQUEUR}`)
