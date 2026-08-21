#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { normaliserProfilPrepare } from '../app/composables/useMonDossier.ts'

const composable = readFileSync('app/composables/useMonDossier.ts', 'utf8')
const page = readFileSync('app/pages/app/mon-dossier.vue', 'utf8')
const fr = JSON.parse(readFileSync('i18n/locales/fr.json', 'utf8'))
const ar = JSON.parse(readFileSync('i18n/locales/ar.json', 'utf8'))

assert.match(
  composable,
  /api\.put<\{ data: ProfilPrepare \}>\('\/me\/profile', payload\)/,
  'la mise à jour du parcours doit utiliser PUT /me/profile via useApi',
)

assert.match(
  composable,
  /current_password: string \| null/,
  'le contrat de mise à jour du compte doit transmettre le mot de passe actuel',
)

assert.deepEqual(
  normaliserProfilPrepare({ exam_code: '  CRMEF-2026  ', objective: '  Réussir  ', target_date: '2026-11-20' }),
  { exam_code: 'CRMEF-2026', objective: 'Réussir', target_date: '2026-11-20' },
  'les valeurs saisies doivent être normalisées avant envoi',
)

assert.deepEqual(
  normaliserProfilPrepare({ exam_code: 'CRMEF', objective: '   ', target_date: '' }),
  { exam_code: 'CRMEF', objective: null, target_date: null },
  'les champs optionnels vides doivent respecter le contrat nullable',
)

for (const marqueur of [
  'profilCharge',
  'profilErreur',
  'envoiParcours',
  'erreurParcours',
  'succesParcours',
  'erreursParcours.exam_code',
  'erreursParcours.objective',
  'erreursParcours.target_date',
  'erreursCompte.current_password',
  'current_password: compte.current_password || null',
  ':required="emailModifie"',
]) {
  assert.ok(page.includes(marqueur), `état ou erreur de champ absent : ${marqueur}`)
}

for (const cle of [
  'parcours_enregistrer',
  'parcours_envoi',
  'parcours_succes',
  'voir_preparations',
  'compte_mot_de_passe',
  'compte_mot_de_passe_aide',
]) {
  assert.equal(typeof fr.dossier[cle], 'string', `clé française absente : dossier.${cle}`)
  assert.equal(typeof ar.dossier[cle], 'string', `clé arabe absente : dossier.${cle}`)
}

console.log('ok — PUT /me/profile, normalisation nullable et états UX FR/AR vérifiés')
