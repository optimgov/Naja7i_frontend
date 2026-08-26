#!/usr/bin/env node
/**
 * preparer-comptes.mjs — crée et vérifie les comptes candidats de recette.
 *
 *   node scripts/recette/preparer-comptes.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN COMPTE PAR PALIER — M-016
 *
 * Il y en avait deux, nommés A et B, et le second n'existait que pour le
 * BLOC-4 : la file d'envoi doit refuser de s'écouler sous une autre identité,
 * ce qui ne se vérifie qu'avec une seconde identité réelle.
 *
 * A portait tout le reste — et donc, depuis les murs du lot 3A.9, il portait
 * une CONTRADICTION. FRONT-4, l'examen blanc et la file d'envoi jouaient sur
 * un compte d'ESSAI des fonctions devenues PAYANTES. Le palier n'était écrit
 * nulle part : il était ce que les recettes précédentes avaient laissé.
 *
 * Le lot tranche « une recette mesure un palier, pas un compte ». Le nom du
 * compte dit donc maintenant son palier, et c'est la première façon de le
 * rendre explicite : personne ne peut lire `recette.session` en croyant
 * mesurer un essai.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI ON NE REDESCEND PAS UN COMPTE D'UN PALIER
 *
 * Parce que le produit l'interdit, et qu'il a raison. `OffreGratuiteService`
 * refuse un essai à qui en a déjà reçu un OU a déjà converti, et les deux
 * faits se lisent sur des traces DURABLES — jamais sur un droit actif
 * (ADR-0033). Un essai clos ne se rouvre pas.
 *
 * Un script qui saurait le rouvrir fabriquerait un état que la plateforme ne
 * peut pas produire, et la recette mesurerait alors un produit imaginaire.
 * D'où des comptes distincts plutôt qu'un compte qu'on remet à zéro.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN COMPTE DONT LE PALIER SE CONSOMME NE PEUT PAS ÊTRE DÉTERMINISTE
 *
 * Les adresses fixes sont rejouables : le script réutilise le compte existant
 * plutôt que d'en créer un à chaque passage — une CI qui sème un compte par
 * exécution laisse une base qui enfle sans que personne ne regarde. C'est une
 * bonne règle, et elle a une frontière qu'il a fallu MESURER pour la voir.
 *
 * `conversion` était donné comme l'exception : il CONVERTIT, la conversion est
 * irréversible, le rejouer sur un compte fixe mesurerait dès la deuxième
 * exécution un compte déjà converti. C'était vrai, mais ce n'était pas une
 * exception — c'était un cas particulier d'une règle plus large :
 *
 *   UN COMPTE DONT LE PALIER EST CONSOMMÉ PAR LA MESURE NE SE REJOUE PAS.
 *
 * L'ESSAI EST DANS CE CAS, ET C'EST LA MESURE QUI L'A DIT. Le droit
 * `questions.answer` de l'essai porte `quota_value = 40` : quarante questions,
 * gouvernantes, jamais renouvelées. Les paliers vendables portent `NULL` —
 * « RÈGLE 2, l'illimité gagne », dans `EnveloppeDeQuestions::gouvernante()`.
 *
 * Un compte d'essai FIXE est donc à usage unique. Constaté, pas déduit : après
 * une exécution, `recette.essai@naja7i.test` était à reliquat 0, et la
 * suivante aurait échoué sur `ENVELOPPE_EPUISEE` dès la passation. Pire, les
 * scénarios d'essai se partageaient les mêmes quarante unités : celui qui
 * passait en premier prenait le budget des autres. C'est un ORDRE IMPLICITE,
 * exactement ce que ce lot retire — et il aurait remplacé la béquille
 * « l'abonnement en dernier » par une béquille moins visible.
 *
 * D'où : un compte d'essai NEUF PAR SCÉNARIO et par exécution. Aucun scénario
 * ne peut dépenser le budget d'un autre, parce qu'il n'y a plus de budget
 * commun. Le coût est de trois comptes par passage, et il est assumé : la
 * chaîne ne sait pas rendre une enveloppe, et un script qui saurait le faire
 * fabriquerait un candidat que la plateforme ne vend pas.
 *
 * Les comptes PAYANTS restent fixes : leur enveloppe est illimitée, donc rien
 * ne s'y consomme, et `poser-le-palier.php` est idempotent.
 *
 * La vérification d'e-mail passe par Mailpit — le même service qu'en
 * développement, déclaré comme conteneur dans le workflow. Lire le jeton dans
 * la boîte plutôt que dans la base éprouve au passage l'envoi réel.
 */

import { writeFileSync } from 'node:fs'

import { client, jetonDeVerification } from './client-api.mjs'

const API = process.env.API_BASE_URL || 'http://localhost:8000'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
const SORTIE = process.env.COMPTES_FICHIER || '/tmp/recette-comptes.json'
const MDP = 'Recette-FRONT3-2026!'

/*
 * `palier` est DÉCLARATIF : c'est `poser-le-palier.php` qui l'établit, scénario
 * par scénario, et qui échoue s'il n'y parvient pas. Ce fichier ne fait que
 * créer les identités et dire à quoi chacune est destinée.
 */
/*
 * L'HORODATAGE DE L'EXÉCUTION, reçu de l'orchestrateur.
 *
 * Il vient de LÀ-BAS et non d'ici : tous les comptes jetables d'un même
 * passage portent alors le même, et se reconnaissent ensemble dans la base
 * quand on vient y voir ce qu'une exécution a laissé.
 */
const HORODATAGE = process.env.HORODATAGE_RECETTE || String(Date.now())

/** Un compte jetable : son palier se consomme, il ne se rejoue donc jamais. */
const jetable = (nom) => `recette.${nom}.${HORODATAGE}@naja7i.test`

export const COMPTES = [
  {
    cle: 'PASSATION',
    email: jetable('passation'),
    motDePasse: MDP,
    palier: 'essai',
    role: 'le palier gratuit : répondre aux questions, et rien d’autre',
  },
  {
    cle: 'REFUS',
    email: jetable('refus'),
    motDePasse: MDP,
    palier: 'essai',
    role: 'le mur DEBOUT : ce que le gratuit se voit refuser',
  },
  {
    /*
     * LA FILE OUVRE HUIT SÉRIES DE CINQ — QUARANTE UNITÉS, l'enveloppe
     * d'essai EXACTEMENT. Zéro marge : le premier cas qu'on lui ajoute la
     * ferait rougir sur « série indisponible », c'est-à-dire pour une raison
     * étrangère à ce qu'elle prouve.
     *
     * Ce qu'elle éprouve est le PROPRIÉTAIRE d'une file, jamais un droit —
     * aucune de ses assertions ne regarde un mur. Son propriétaire prend donc
     * le plus petit palier dont l'enveloppe est ILLIMITÉE. C'est un choix de
     * mesure, pas un contournement : on retire de son verdict la seule cause
     * d'échec qui ne dit rien sur la file.
     */
    cle: 'FILE',
    email: 'recette.file@naja7i.test',
    motDePasse: MDP,
    palier: 'decouverte-7j',
    role: 'le propriétaire de la file — enveloppe illimitée, pour que seule la file la fasse rougir',
  },
  {
    /* L'INTRUSE RESTE EN ESSAI, et elle reste FIXE : elle se connecte, tente
     * d'écouler la file d'un autre, et repart. Elle ne répond à aucune
     * question, donc elle ne consomme rien — une identité ordinaire est
     * précisément ce que ce cas demande. */
    cle: 'FILE_2',
    email: 'recette.file-2@naja7i.test',
    motDePasse: MDP,
    palier: 'essai',
    role: 'la seconde identité du BLOC-4 — la file refuse de s’écouler sous elle',
  },
  {
    cle: 'ENTREE',
    email: 'recette.entree@naja7i.test',
    motDePasse: MDP,
    palier: 'decouverte-7j',
    role: 'le socle payant : questions, causes, série ciblée, examen blanc',
  },
  {
    cle: 'SESSION',
    email: 'recette.session@naja7i.test',
    motDePasse: MDP,
    palier: 'session-180j',
    role: 'la profondeur : ordonnance, séance mémoire, carte détaillée',
  },
  {
    cle: 'CONVERSION',
    email: jetable('conversion'),
    motDePasse: MDP,
    palier: 'essai',
    role: 'le chemin de revenu — il convertit, donc il ne se rejoue jamais',
  },
]

async function preparer({ cle, email, motDePasse, palier, role }) {
  const sac = client(API)
  await sac.ouvrir()

  // Déjà là ? On se contente de vérifier qu'il ouvre.
  const connexion = await sac.appel('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password: motDePasse },
  })

  if (connexion.statut < 400) {
    const moi = await sac.appel('/api/v1/me')
    if (moi.statut < 400 && moi.corps?.data?.email_verified) {
      console.log(`  ${cle} · palier ${palier} · déjà présent (${email})`)
      console.log(`      ${role}`)
      return { cle, email, motDePasse, palier, role, uuid: moi.corps.data.uuid }
    }
  }

  const neuf = client(API)
  await neuf.ouvrir()

  const creation = await neuf.appel('/api/v1/auth/register', {
    method: 'POST',
    body: {
      /*
       * LES QUATRE CHAMPS DE QUALIFICATION SONT OBLIGATOIRES depuis `280e08c`
       * (« qualifier les comptes et invitations »). Les omettre rend un 422, et
       * la recette n'obtenait alors aucun jeton de vérification — l'échec
       * tombait dix lignes plus loin, sur une phrase qui parlait de jeton.
       *
       * Ils sont ici parce que `RegisterRequest` les exige, pas parce qu'ils
       * servent au scénario : la recette ne mesure rien sur eux.
       */
      first_name: 'Recette',
      last_name: 'Automatique',
      academic_level: 'Licence',
      address: 'Adresse de recette, Rabat',
      email,
      password: motDePasse,
      password_confirmation: motDePasse,
      locale: 'fr',
      terms_accepted: true,
      privacy_notice_acknowledged: true,
      marketing_granted: false,
    },
  })

  /*
   * LA TOLÉRANCE EST RESSERRÉE À CE QU'ELLE VISAIT.
   *
   * Elle acceptait TOUT `VALIDATION_FAILED`, alors qu'elle n'existe que pour un
   * cas : le compte existe déjà d'une exécution précédente, et l'unicité de
   * l'adresse le refuse. En avalant les autres, elle a masqué la rupture de
   * contrat ci-dessus pendant deux jours et déplacé l'échec loin de sa cause.
   *
   * Un refus qui ne porte que sur `email` reste donc toléré ; tout autre champ
   * en défaut arrête la recette et se nomme.
   */
  if (creation.statut >= 400) {
    /* `details` voyage en TABLEAU `[{field, messages}]`, mais le client d'API
     * accepte aussi le dictionnaire `{champ: [messages]}` — on lit les deux
     * plutôt que de dépendre d'un détail de sérialisation. */
    const details = creation.corps?.error?.details
    const champs = Array.isArray(details)
      ? details.map(d => d?.field).filter(Boolean)
      : Object.keys(details ?? {})
    const seulementEmail = champs.length > 0 && champs.every(f => f === 'email')

    if (creation.corps?.error?.code !== 'VALIDATION_FAILED' || !seulementEmail) {
      throw new Error(
        `compte ${cle} : création refusée — ${creation.statut}`
        + (champs.length ? ` — champ(s) en défaut : ${champs.join(', ')}` : '')
        + ` — ${creation.texte.slice(0, 200)}`,
      )
    }
  }

  const jeton = await jetonDeVerification(email, MAILPIT)
  if (!jeton) throw new Error(`compte ${cle} : aucun jeton de vérification reçu pour ${email}`)

  const verif = await neuf.appel('/api/v1/auth/email/verify', {
    method: 'POST',
    body: { token: jeton },
  })

  if (verif.statut >= 400) {
    throw new Error(`compte ${cle} : vérification refusée — ${verif.statut} ${verif.texte.slice(0, 200)}`)
  }

  console.log(`  ${cle} · palier ${palier} · créé et vérifié (${email})`)
  console.log(`      ${role}`)
  return { cle, email, motDePasse, palier, role, uuid: verif.corps?.data?.uuid ?? null }
}

const prets = []
for (const compte of COMPTES) prets.push(await preparer(compte))

writeFileSync(SORTIE, JSON.stringify(prets, null, 2))
console.log(`  → ${SORTIE}`)
