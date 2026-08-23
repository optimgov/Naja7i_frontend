#!/usr/bin/env node
/**
 * amorcer-un-passe.mjs — DONNER À UN COMPTE LE PASSÉ QUE SON SCÉNARIO EXIGE.
 *
 *   COMPTE_EMAIL=… COMPTE_MDP=… CODE_EPREUVE=… node scripts/recette/amorcer-un-passe.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE — M-016
 *
 * « Aucune recette ne dépend de l'ordre d'exécution d'une autre pour être
 * juste. » FRONT-4 en dépendait sans le dire : son ordonnance et ses rendez-vous
 * mémoire naissent des réponses d'une série PASSÉE, et cette série lui venait
 * de la recette de passation, jouée plus tôt sur le même compte.
 *
 * Tant qu'un seul compte traversait toute la chaîne, cela tenait — mal, mais
 * cela tenait. Avec un compte par palier, le compte de FRONT-4 est neuf : il
 * n'a rien passé, l'ordonnance est vide, le calendrier aussi, et
 * `echoir-revisions.php` n'a rien à reculer.
 *
 * Ce script pose ce passé, explicitement, avant le scénario qui en a besoin.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IL VÉRIFIE CE QU'IL A PRODUIT — une erreur DIAGNOSTIQUÉE, pas « une série »
 *
 * Un rendez-vous mémoire ne naît pas de n'importe quelle faute. Il lui en faut
 * deux propriétés à la fois : commise AVEC CERTITUDE — la seule qui prouve
 * qu'une notion crue acquise ne l'est pas — et portant une CAUSE étiquetée sur
 * le distracteur choisi. Sans la seconde, `MemoryScheduler` passe son chemin :
 * « sans cause, pas de rendez-vous ».
 *
 * La première version de ce script ne vérifiait que la première propriété, et
 * s'arrêtait au premier succès. Mesuré : dix erreurs certaines, zéro
 * rendez-vous, et FRONT-4 qui mesurait un écran vide en croyant mesurer une
 * boucle. Voir `erreursCertaines()` plus bas.
 *
 * On ne peut pas choisir une mauvaise réponse à l'avance : la passation ne
 * porte ni `is_correct`, ni `rationale`, ni `cause` — c'est précisément ce que
 * `recette-passation.mjs` vérifie sur le fil. On répond donc TOUT à la même
 * position, on SOUMET, puis on lit la correction, qui les révèle. Si aucune
 * erreur certaine n'en sort, on recommence à la position suivante : il
 * faudrait que la bonne réponse soit à la même place pour toutes les questions
 * de quatre séries d'affilée pour épuiser les positions.
 *
 * IDEMPOTENT : un compte qui porte déjà une erreur certaine n'est pas retouché.
 * Une recette rejouée ne doit pas empiler les séries — le reliquat d'enveloppe
 * en dépend, et c'est lui que S-10 mesure ailleurs.
 */

import { client } from './client-api.mjs'

const API = process.env.API_BASE_URL || 'http://localhost:8000'
const EMAIL = process.env.COMPTE_EMAIL || ''
const MDP = process.env.COMPTE_MDP || ''
const EPREUVE = process.env.CODE_EPREUVE || 'CRMEF-FR-SPEC-2025'

/** Nombre de positions d'option tentées avant d'abandonner. Voir l'en-tête. */
const POSITIONS = 4

if (!EMAIL || !MDP) {
  console.error('ÉCHEC : COMPTE_EMAIL et COMPTE_MDP sont requis.')
  process.exit(1)
}

const sac = client(API)
await sac.ouvrir()

const connexion = await sac.appel('/api/v1/auth/login', {
  method: 'POST',
  body: { email: EMAIL, password: MDP },
})

if (connexion.statut >= 400) {
  console.error(`ÉCHEC : connexion refusée pour ${EMAIL} — ${connexion.statut}`)
  process.exit(1)
}

/**
 * LES ERREURS QUI COMPTENT — et le premier critère était le mauvais.
 *
 * Ce script comptait les erreurs commises avec certitude, et s'arrêtait dès
 * qu'il en trouvait. Mesuré : dix erreurs certaines, et ZÉRO rendez-vous
 * mémoire. `MemoryScheduler::planFromAttempt` est explicite — « sans cause,
 * pas de rendez-vous » : F07 révise une erreur DIAGNOSTIQUÉE, et un
 * distracteur que personne n'a étiqueté n'en est pas une.
 *
 * Le critère est donc l'erreur certaine PORTANT UNE CAUSE, c'est-à-dire
 * exactement la condition que le planificateur applique. C'est la même leçon
 * qu'ailleurs sur ce chantier : une garde qui s'arrête sur un signe voisin de
 * ce qu'elle veut prouver ne prouve pas ce qu'elle croit.
 *
 * La cause n'est lisible que si l'accès l'ouvre — d'où `EXIGENCE`, qui laisse
 * l'appelant dire ce dont son scénario a besoin :
 *
 *   `cause-diagnostiquee`  l'erreur certaine dont le distracteur porte une
 *                          cause. C'est ce qui crée un rendez-vous mémoire, et
 *                          il faut un palier qui rende les causes pour le lire.
 *   `erreur-certaine`      l'erreur certaine, sans plus. `cause_locked` ne
 *                          demande pas de cause étiquetée — il se lit sur
 *                          « fausse, et non révélée » — donc le chemin de
 *                          revenu se contente de celle-ci.
 */
const EXIGENCE = process.env.EXIGENCE || 'cause-diagnostiquee'

async function erreursCertaines(uuid) {
  const r = await sac.appel(`/api/v1/me/attempts/${uuid}/correction`)
  if (r.statut !== 200) return 0

  return (r.corps?.data ?? []).filter((ligne) => {
    const certaine = ligne.answer?.is_correct === false && ligne.answer?.confidence === 'sure'
    if (!certaine) return false
    if (EXIGENCE === 'erreur-certaine') return true

    /* La cause n'est servie que sur l'option CHOISIE (F03) : si elle est là,
     * le distracteur est étiqueté, et le planificateur créera le rendez-vous. */
    return (ligne.options ?? []).some(o => o.cause !== null && o.cause !== undefined)
  }).length
}

/** Le compte porte-t-il déjà ce qu'il faut ? */
async function dejaAmorce() {
  const r = await sac.appel('/api/v1/me/attempts')
  const passees = (r.corps?.data ?? []).filter(a => a.status !== 'in_progress')

  for (const a of passees) {
    if (await erreursCertaines(a.uuid) > 0) return a.uuid
  }

  return null
}

const dejaLa = await dejaAmorce()

if (dejaLa !== null) {
  console.log(`  passé déjà en place pour ${EMAIL} — tentative ${dejaLa.slice(0, 8)}…`)
  process.exit(0)
}

let obtenu = 0

for (let position = 0; position < POSITIONS && obtenu === 0; position += 1) {
  const ouverture = await sac.appel(`/api/v1/me/diagnostics/${encodeURIComponent(EPREUVE)}`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    /*
     * DES SÉRIES COURTES, PARCE QUE L'ENVELOPPE SE COMPTE — M-016.
     *
     * Ce script sert au chemin de revenu, dont le compte est en ESSAI : une
     * enveloppe de QUARANTE questions, non renouvelable. À dix questions par
     * position et quatre positions, le pire cas la vidait entièrement — et le
     * scénario qu'on amorce échouait alors sur `ENVELOPPE_EPUISEE` avant même
     * d'avoir converti, c'est-à-dire pour une raison étrangère à ce qu'il
     * prouve.
     *
     * Cinq suffisent : une position fausse rend cinq erreurs, et il n'en faut
     * qu'une. Mesuré sur la banque de recette — position 1 : zéro erreur (la
     * bonne réponse y est), position 2 : toutes. Le pire cas passe de quarante
     * unités à vingt, et laisse de quoi mesurer.
     */
    body: { total: 5 },
  })

  if (ouverture.statut >= 400) {
    console.error(
      `ÉCHEC : diagnostic refusé pour ${EMAIL} — ${ouverture.statut} `
      + `${ouverture.texte.slice(0, 300)}`,
    )
    process.exit(1)
  }

  const tentative = ouverture.corps.data
  const items = tentative.items ?? []

  for (const item of items) {
    /*
     * LES OPTIONS VIVENT SOUS `question`, PAS SUR L'ITEM.
     *
     * La première version lisait `item.options` — absent — et envoyait donc
     * `option_uuid: null`. Le serveur enregistrait une réponse SANS choix, que
     * la correction rend `is_correct: false` : le script croyait avoir produit
     * dix erreurs certaines, alors qu'il avait produit dix questions SAUTÉES.
     *
     * Rien ne rougissait, parce que « faux » et « pas répondu » se ressemblent
     * quand on ne regarde que `is_correct`. C'est le calendrier vide qui l'a
     * révélé — `MemoryScheduler` ne programme rien sans cause, et une question
     * sautée n'en a pas.
     */
    const options = item.question?.options ?? []
    const choisie = options[position] ?? options[0]

    if (choisie === undefined) {
      console.error(`ÉCHEC : l'item ${item.item_uuid} ne porte aucune option.`)
      process.exit(1)
    }

    const r = await sac.appel(`/api/v1/me/attempts/${tentative.uuid}/items/${item.item_uuid}`, {
      method: 'PUT',
      body: {
        /* Toujours la MÊME position, et `sure` : c'est ce qui rend la série
         * capable de produire une erreur certaine, donc un rendez-vous. */
        option_uuid: choisie.uuid,
        confidence: 'sure',
        elapsed_ms: 4200,
        client_reported_at: new Date().toISOString(),
      },
    })

    /* On lit le refus. Une réponse rejetée en silence redonnerait exactement le
     * défaut que le paragraphe ci-dessus décrit. */
    if (r.statut >= 400) {
      console.error(`ÉCHEC : réponse refusée sur ${item.item_uuid} — ${r.statut} ${r.texte.slice(0, 200)}`)
      process.exit(1)
    }
  }

  const fin = await sac.appel(`/api/v1/me/attempts/${tentative.uuid}/submit`, {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })

  if (fin.statut >= 400) {
    console.error(`ÉCHEC : soumission refusée — ${fin.statut} ${fin.texte.slice(0, 300)}`)
    process.exit(1)
  }

  obtenu = await erreursCertaines(tentative.uuid)

  console.log(
    `  série soumise (${items.length} questions, option ${position + 1}) `
    + `→ ${obtenu} erreur(s) répondant à « ${EXIGENCE} »`,
  )
}

if (obtenu === 0) {
  console.error(
    `ÉCHEC : ${POSITIONS} séries passées sans produire une seule erreur « ${EXIGENCE} ».`
    + (EXIGENCE === 'cause-diagnostiquee'
      ? ' Aucun distracteur choisi ne portait de cause étiquetée : le calendrier mémoire'
        + ' resterait vide, et le scénario mesurerait un écran vide en croyant mesurer'
        + ' une boucle. Vérifiez que la banque de recette est bien celle que sème'
        + ' semer-banque.mjs — ses distracteurs sont tous étiquetés.'
      : ''),
  )
  process.exit(1)
}

console.log(`  passé amorcé pour ${EMAIL} — ${obtenu} erreur(s) « ${EXIGENCE} »`)
