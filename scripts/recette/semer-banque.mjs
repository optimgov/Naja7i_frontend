#!/usr/bin/env node
/**
 * semer-banque.mjs — la banque de questions de recette, semée PAR L'API.
 *
 *   node scripts/recette/semer-banque.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA BASCULE ANNONCÉE AU D-F40, MAINTENANT QUE LES ROUTES EXISTENT
 *
 * Le semis passait par `tinker` et le service de domaine, faute de point
 * d'entrée HTTP pour trois transitions du cycle éditorial. Le PAS-33 les a
 * ouvertes — `submit`, `review`, `validate` — et le semis en est le premier
 * appelant : il mène chaque question du brouillon au publié par l'API, sous
 * trois identités distinctes, et ne touche plus la base.
 *
 * LE SEMIS EST DONC DEVENU UNE SECONDE GARDE. Une régression de la chaîne
 * éditoriale ne se manifeste plus au bout de la recette par une banque vide et
 * inexplicable : elle échoue ici, à l'étape qui l'a causée, en nommant le
 * métier et le refus.
 *
 * IDEMPOTENT PAR VÉRIFICATION D'ÉTAT, ET C'EST LA SEULE FAÇON. Une transition
 * rejouée répond 422 : `a_verifier → a_verifier` n'est pas une arête, et le
 * service refuse au lieu de faire croire qu'il a agi. Le semis lit donc l'état
 * courant de chaque question et ne joue QUE les transitions qui manquent.
 * Rejoué sur une banque déjà publiée, il n'émet aucune écriture.
 *
 * CE QU'IL NE FAIT PAS : créer les comptes éditoriaux, les remédiations et
 * lire l'uuid de la source. Rien de tout cela n'a de route ; c'est le travail
 * de `preparer-referentiel.php`, qui lui passe un fichier.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from 'node:fs'

import { client, motif } from './client-api.mjs'

const API = process.env.API_BASE_URL || 'http://localhost:8000'
const REFERENTIEL = process.env.REFERENTIEL_FICHIER || '/tmp/recette-referentiel.json'
const ADMIN = '/api/v1/admin'

/** Deux questions par domaine : au-delà de dix éligibles, le diagnostic ouvre. */
const PAR_DOMAINE = 2

const CAUSES = [
  'confusion_notions', 'lecture_enonce', 'regle_mal_appliquee', 'connaissance_absente',
  'piege_formulation', 'calcul', 'source_perimee', 'indetermine',
]

const echouer = (message) => {
  console.error(`\n  ÉCHEC — ${message}`)
  process.exit(1)
}

let referentiel
try {
  referentiel = JSON.parse(readFileSync(REFERENTIEL, 'utf8'))
} catch (e) {
  echouer(`référentiel illisible (${REFERENTIEL}) : ${e.message}\n`
    + '  Il est écrit par preparer-referentiel.php, joué juste avant.')
}

// ──────────────────────────────────────────────────── les trois identités
/*
 * TROIS CLIENTS, TROIS SESSIONS. Le même bocal à cookies pour deux métiers
 * ferait valider une question par son auteur — ce que le service refuse, et
 * que la recette mettrait longtemps à expliquer.
 */
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

// ─────────────────────────────────────────────── le contrôle documentaire
/*
 * AVANT toute rédaction, et c'est ce qui rend l'ordre lisible : une source
 * vérifiée qualifie les citations faites APRÈS son contrôle
 * (`QuestionAuthoringService::rediger`). Vérifier d'abord, c'est n'avoir
 * ensuite qu'un seul état possible pour chaque citation.
 *
 * Publier pour le diagnostic l'exige — citer une source ne la vérifie pas
 * (DET-46). Le relecteur porte l'acte : `questions.review`.
 */
const verification = await reviseur.appel(
  `${ADMIN}/sources/${referentiel.source.uuid}/verify`,
  { method: 'POST' },
)

if (verification.statut >= 400) {
  echouer(`vérification de la source ${referentiel.source.code} refusée — `
    + `${verification.statut} ${motif(verification)}`)
}

console.log(`  source ${referentiel.source.code} vérifiée`
  + ` · ${verification.corps?.meta?.citations_updated ?? 0} citation(s) mise(s) à jour`)

// ────────────────────────────────────────────────────────── la chaîne
/*
 * Chaque état connaît SON successeur, et le métier qui le porte. Écrire la
 * chaîne comme une table plutôt que comme une suite d'appels rend l'idempotence
 * gratuite : reprendre une question à mi-parcours, c'est entrer dans la table à
 * son état courant.
 */
const CHAINE = {
  draft: { nom: 'soumettre', par: 'auteur', client: () => auteur, action: 'submit' },
  a_verifier: { nom: 'relire', par: 'relecteur', client: () => reviseur, action: 'review' },
  reviewed: { nom: 'valider', par: 'valideur', client: () => editeur, action: 'validate' },
  pedagogically_validated: {
    nom: 'publier', par: 'valideur', client: () => editeur, action: 'publish',
    corps: { for_diagnostic: true, for_simulation: true },
  },
}

/**
 * Ce qui empêcherait la publication au diagnostic, AVANT de la tenter.
 *
 * Les deux listes ne se recouvrent pas : `publication_blockers` juge la
 * question telle qu'elle est — donc pas encore éligible au diagnostic — et
 * n'inclut pour cette raison NI les causes des distracteurs NI la source
 * vérifiée. `diagnostic_blockers` porte les premières. La source, elle, n'est
 * exigée qu'une fois l'éligibilité posée : personne ne la signale avant, et le
 * drapeau de la citation est la seule lecture qui la donne.
 */
function entraves(reponse) {
  const meta = reponse.corps?.meta ?? {}
  const liste = [...(meta.publication_blockers ?? []), ...(meta.diagnostic_blockers ?? [])]

  const sources = reponse.corps?.data?.sources ?? []
  if (!sources.some((s) => s.verification === 'verified')) {
    liste.push('Aucune source de contenu vérifiée n’est citée.')
  }

  return [...new Set(liste)]
}

/*
 * L'ORDRE DE LA CHAÎNE, POUR DÉPARTAGER DEUX QUESTIONS DE MÊME ÉNONCÉ.
 *
 * L'énoncé numéroté est une clé naturelle, pas une contrainte d'unicité : rien
 * en base n'empêche deux questions de le porter. Une exécution interrompue en
 * laisse justement une à mi-chemin, et la banque de développement en contenait
 * une — n° 1 restée `pedagogically_validated`, à côté de la n° 1 publiée.
 *
 * Prendre « la dernière servie » revenait à tirer au sort : le semis a choisi
 * l'orpheline, a tenté de la publier, et a échoué sur des manques bien réels.
 * On retient donc la PLUS AVANCÉE — si une question de cet énoncé est déjà
 * publiée, le but du semis est atteint, quoi qu'il traîne à côté.
 */
const RANG = {
  draft: 0, a_verifier: 1, reviewed: 2, pedagogically_validated: 3, published: 4,
}

/** Mène une question jusqu'à `published`, en ne jouant que ce qui manque. */
async function mener(uuid, depuis, etiquette) {
  let etat = depuis

  for (let garde = 0; etat !== 'published'; garde++) {
    if (garde > Object.keys(CHAINE).length) {
      echouer(`${etiquette} : la chaîne ne converge pas, bloquée à « ${etat} »`)
    }

    const etape = CHAINE[etat]

    if (etape === undefined) {
      echouer(`${etiquette} : état « ${etat} » — aucune transition connue depuis là.`)
    }

    /* Le contrôle documentaire et les causes des distracteurs ne sont opposés
     * qu'à la publication. On les lit juste avant, pour que le refus nomme ce
     * qui manque au lieu d'un « non publiable » sec. */
    if (etape.action === 'publish') {
      const avant = await editeur.appel(`${ADMIN}/questions/${uuid}`)

      if (avant.statut >= 400) {
        echouer(`${etiquette} : relecture avant publication refusée — ${avant.statut} ${motif(avant)}`)
      }

      const manques = entraves(avant)

      if (manques.length > 0) {
        echouer(`${etiquette} : publication impossible —\n    - ${manques.join('\n    - ')}`)
      }
    }

    const reponse = await etape.client().appel(`${ADMIN}/questions/${uuid}/${etape.action}`, {
      method: 'POST',
      ...(etape.corps ? { body: etape.corps } : {}),
    })

    if (reponse.statut >= 400) {
      echouer(`${etiquette} : ${etape.nom} (${etape.par}) refusé — `
        + `${reponse.statut} ${motif(reponse)}`)
    }

    const apres = reponse.corps?.data?.status

    if (apres === etat) {
      echouer(`${etiquette} : ${etape.nom} n'a pas fait avancer l'état (« ${etat} »).`)
    }

    etat = apres
  }

  return etat
}

// ─────────────────────────────────────────────────────────── le semis
const bilan = { creees: 0, reprises: 0, deja: 0, eligibles: 0 }
const doublons = []

for (const [i, noeud] of referentiel.noeuds.entries()) {
  /*
   * L'ÉTAT EXISTANT, LU AVANT D'ÉCRIRE. L'énoncé porte son numéro : il sert de
   * clé naturelle, comme du temps de `tinker`, et les questions déjà semées
   * gardent leur identité d'une exécution à l'autre.
   */
  const connues = await auteur.appel(
    `${ADMIN}/questions?competency=${encodeURIComponent(noeud.code)}&locale=fr`,
  )

  if (connues.statut >= 400) {
    echouer(`lecture de la banque pour ${noeud.code} refusée — ${connues.statut} ${motif(connues)}`)
  }

  /* La liste est plafonnée à 50. Au-delà, une question déjà semée pourrait ne
   * pas être servie et le semis la recréerait en double : on s'arrête plutôt
   * que de semer à l'aveugle. */
  if ((connues.corps?.meta?.pending ?? 0) > 0) {
    echouer(`${noeud.code} : ${connues.corps.meta.total} questions pour un plafond de `
      + `${connues.corps.meta.cap} — l'état existant n'est plus lisible en une fois.`)
  }

  const parEnonce = new Map()

  for (const q of connues.corps?.data ?? []) {
    const connue = parEnonce.get(q.stem)

    if (connue === undefined) {
      parEnonce.set(q.stem, q)
      continue
    }

    /* Un doublon ne se supprime pas depuis ici — le semis n'a pas à effacer ce
     * qu'il n'a pas écrit — mais il ne passe pas non plus sous silence. */
    doublons.push(`${noeud.code} : « ${q.stem.slice(0, 48)}… » existe en `
      + `${connue.status} et ${q.status}`)

    if ((RANG[q.status] ?? -1) > (RANG[connue.status] ?? -1)) parEnonce.set(q.stem, q)
  }

  for (const k of Array.from({ length: PAR_DOMAINE }, (_, j) => j + 1)) {
    const n = i * PAR_DOMAINE + k
    /*
     * L'ÉNONCÉ SE LIT COMME UNE QUESTION, PAS COMME UN NUMÉRO DE RECETTE.
     *
     * « Question de recette n° 16 — Théâtre : laquelle de ces propositions est
     * exacte ? » apparaissait dans les captures de proposition et disqualifiait
     * l'écran au premier regard. Le contenu reste GÉNÉRIQUE — il ne peut pas
     * être autre chose, la banque couvre dix domaines qu'aucun humain n'a
     * rédigés — mais il prend la forme d'un item réel.
     *
     * Il n'affirme AUCUN fait administratif : ni programme, ni coefficient, ni
     * barème. Il porte sur le cadre d'application d'une notion, ce qui est vrai
     * de n'importe quel domaine sans rien inventer d'aucun.
     *
     * Deux formulations par domaine, ce qui suffit à l'unicité : l'énoncé reste
     * la clé naturelle du semis, comme avant.
     */
    const enonce = k === 1
      ? `Dans le domaine « ${noeud.nom} », quelle formulation décrit correctement la notion évaluée ?`
      : `Dans le domaine « ${noeud.nom} », quelle situation mobilise correctement la notion évaluée ?`
    const etiquette = `n° ${n} (${noeud.code})`

    const existante = parEnonce.get(enonce)

    if (existante?.status === 'published') {
      bilan.deja++
      if (existante.eligible_for_diagnostic) bilan.eligibles++
      continue
    }

    let uuid = existante?.uuid
    let depuis = existante?.status

    if (uuid === undefined) {
      const creation = await auteur.appel(`${ADMIN}/questions`, {
        method: 'POST',
        body: {
          exam_code: referentiel.epreuve,
          competency_node_uuid: noeud.uuid,
          locale: 'fr',
          stem: enonce,
          explanation: `La proposition A est exacte : la notion du domaine « ${noeud.nom} » y est mobilisée dans son cadre d'application, et les trois autres l'en font sortir.`,
          kind: 'qcm_single',
          difficulty: 3,
          remediation_uuid: noeud.remediation_uuid,
          source_code: referentiel.source.code,
          source_locator: 'p. 42',
          /* Quatre options, une seule exacte, et TOUS les distracteurs
           * étiquetés d'une cause : sans elles, la publication pour diagnostic
           * est refusée (fiche F03 v1.1). */
          /*
           * QUATRE POSITIONS DISTINCTES — A, B, C, D.
           *
           * `String.fromCharCode(63 + p)` avec `p` partant de 2 rendait 65,
           * soit `A` : les captures affichaient A, A, B, C. Le décalage est de
           * un — `64 + p` donne B, C, D — et il se voyait au premier regard sur
           * un écran destiné à juger le sérieux du produit.
           *
           * L'option correcte reste en première position et porte donc `A` :
           * c'est le rendu qui distribue les lettres, pas les données.
           */
          options: [
            {
              content: 'A — Elle s\'applique dans le cadre défini par le programme, et seulement dans ce cadre.',
              is_correct: true,
              rationale: 'Exacte : la notion est mobilisée à l\'intérieur de son domaine de validité, '
                + 'ce qui est précisément ce que l\'épreuve évalue.',
            },
            ...[2, 3, 4].map((p) => ({
              content: `${String.fromCharCode(64 + p)} — ` + [
                'Elle s\'étend à tous les cas voisins, sans distinction de cadre.',
                'Elle se déduit d\'un exemple isolé, sans vérifier les conditions d\'application.',
                'Elle se confond avec la notion voisine du même domaine.',
              ][p - 2],
              is_correct: false,
              rationale: 'Fausse : la notion est invoquée hors du cadre qui la rend valide — '
                + 'l\'erreur porte sur la portée, pas sur la définition.',
              cause: CAUSES[(n + p) % CAUSES.length],
            })),
          ],
        },
      })

      if (creation.statut >= 400) {
        echouer(`${etiquette} : rédaction refusée — ${creation.statut} ${motif(creation)}`)
      }

      uuid = creation.corps?.data?.uuid
      depuis = creation.corps?.data?.status
      bilan.creees++
    } else {
      bilan.reprises++
    }

    await mener(uuid, depuis, etiquette)

    /* L'éligibilité est rendue par la publication elle-même : on la lit là où
     * elle est affirmée, plutôt que de la supposer acquise. */
    const publiee = await editeur.appel(`${ADMIN}/questions/${uuid}`)
    if (publiee.corps?.data?.eligible_for_diagnostic) bilan.eligibles++
  }
}

console.log(
  `  banque : ${bilan.creees} créée(s), ${bilan.reprises} reprise(s) en cours de chaîne, `
    + `${bilan.deja} déjà publiée(s)`,
)
console.log(`  éligibles au diagnostic : ${bilan.eligibles}`)

/* Signalé, jamais tu : une banque de développement qui accumule des jumelles à
 * mi-chaîne finit par rendre le semis illisible. En CI, la base est neuve et
 * cette liste est toujours vide. */
for (const d of doublons) console.log(`  doublon d’énoncé — ${d}`)

if (bilan.eligibles < 10) {
  echouer(`moins de dix questions éligibles au diagnostic (${bilan.eligibles}) — `
    + 'les recettes ne pourront pas ouvrir de série.')
}
