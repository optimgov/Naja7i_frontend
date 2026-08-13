#!/usr/bin/env node
/**
 * preparer-comptes.mjs — crée et vérifie les deux comptes candidats de recette.
 *
 *   node scripts/recette/preparer-comptes.mjs
 *
 * Deux comptes, parce que le BLOC-4 l'exige : la file d'envoi doit refuser de
 * s'écouler sous une autre identité, et cela ne se vérifie qu'avec une seconde
 * identité réelle.
 *
 * Les adresses sont DÉTERMINISTES et rejouables : le script réutilise un compte
 * existant plutôt que d'en créer un nouveau à chaque exécution. Une CI qui sème
 * un compte par passage laisse une base qui enfle sans que personne ne regarde.
 *
 * La vérification d'e-mail passe par Mailpit — le même service qu'en
 * développement, déclaré comme conteneur dans le workflow. Lire le jeton dans
 * la boîte plutôt que dans la base éprouve au passage l'envoi réel.
 */

import { writeFileSync } from 'node:fs'

import { client } from './client-api.mjs'

const API = process.env.API_BASE_URL || 'http://localhost:8000'
const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025'
const SORTIE = process.env.COMPTES_FICHIER || '/tmp/recette-comptes.json'

export const COMPTES = [
  { cle: 'A', email: 'recette.a@naja7i.test', motDePasse: 'Recette-FRONT3-2026!' },
  { cle: 'B', email: 'recette.b@naja7i.test', motDePasse: 'Recette-FRONT3-2026!' },
]

/** Le jeton de vérification, lu dans la boîte de réception. */
async function jetonDeVerification(email) {
  for (let essai = 0; essai < 20; essai++) {
    const liste = await fetch(`${MAILPIT}/api/v1/messages?limit=30`).then((r) => r.json())
    const message = liste.messages?.find((m) => m.To?.some((t) => t.Address === email))

    if (message) {
      const detail = await fetch(`${MAILPIT}/api/v1/message/${message.ID}`).then((r) => r.json())
      const corps = (detail.Text ?? '') + (detail.HTML ?? '')
      const trouve = corps.match(/token=([A-Za-z0-9]+)/)
      if (trouve) return trouve[1]
    }

    await new Promise((r) => setTimeout(r, 500))
  }
  return null
}

async function preparer({ cle, email, motDePasse }) {
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
      console.log(`  compte ${cle} : déjà présent et vérifié (${email})`)
      return { cle, email, motDePasse, uuid: moi.corps.data.uuid }
    }
  }

  const neuf = client(API)
  await neuf.ouvrir()

  const creation = await neuf.appel('/api/v1/auth/register', {
    method: 'POST',
    body: {
      email,
      password: motDePasse,
      password_confirmation: motDePasse,
      locale: 'fr',
      terms_accepted: true,
      privacy_notice_acknowledged: true,
      marketing_granted: false,
    },
  })

  if (creation.statut >= 400 && creation.corps?.error?.code !== 'VALIDATION_FAILED') {
    throw new Error(`compte ${cle} : création refusée — ${creation.statut} ${creation.texte.slice(0, 200)}`)
  }

  const jeton = await jetonDeVerification(email)
  if (!jeton) throw new Error(`compte ${cle} : aucun jeton de vérification reçu pour ${email}`)

  const verif = await neuf.appel('/api/v1/auth/email/verify', {
    method: 'POST',
    body: { token: jeton },
  })

  if (verif.statut >= 400) {
    throw new Error(`compte ${cle} : vérification refusée — ${verif.statut} ${verif.texte.slice(0, 200)}`)
  }

  console.log(`  compte ${cle} : créé et vérifié (${email})`)
  return { cle, email, motDePasse, uuid: verif.corps?.data?.uuid ?? null }
}

const prets = []
for (const compte of COMPTES) prets.push(await preparer(compte))

writeFileSync(SORTIE, JSON.stringify(prets, null, 2))
console.log(`  → ${SORTIE}`)
