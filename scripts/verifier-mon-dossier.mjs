#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { normaliserProfilPrepare } from '../app/composables/useMonDossier.ts'

const composable = readFileSync('app/composables/useMonDossier.ts', 'utf8')
const page = readFileSync('app/pages/app/mon-dossier.vue', 'utf8')
const inscription = readFileSync('app/pages/inscription.vue', 'utf8')
const garde = readFileSync('app/middleware/auth.ts', 'utf8')
const layout = readFileSync('app/layouts/app.vue', 'utf8')
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
  'autocomplete="tel" inputmode="tel" required',
  'poursuivreSiComplet',
]) {
  assert.ok(page.includes(marqueur), `état ou erreur de champ absent : ${marqueur}`)
}

for (const ancienChamp of ['given-name', 'family-name', 'street-address']) {
  assert.ok(!inscription.includes(ancienChamp), `l’inscription ne doit plus demander ${ancienChamp}`)
}

assert.ok(garde.includes('onboarding_complete'), 'la garde privée doit imposer le dossier initial')
assert.ok(garde.includes("'/app/mon-dossier'"), 'la garde doit conduire vers Mon dossier')
assert.ok(layout.includes('dossierComplet'), 'la navigation privée doit rester fermée pendant le dossier initial')

for (const cle of [
  'parcours_enregistrer',
  'parcours_envoi',
  'parcours_succes',
  'voir_preparations',
  'compte_mot_de_passe',
  'compte_mot_de_passe_aide',
  'intro_obligatoire',
  'obligatoire',
  'telephone_marocain',
]) {
  assert.equal(typeof fr.dossier[cle], 'string', `clé française absente : dossier.${cle}`)
  assert.equal(typeof ar.dossier[cle], 'string', `clé arabe absente : dossier.${cle}`)
}

console.log('ok — inscription courte, dossier obligatoire, mobile marocain et états UX FR/AR vérifiés')
