#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { contientQuestionDemonstration } from '../app/utils/demonstration.ts'

const accueil = readFileSync('app/pages/index.vue', 'utf8')
const preuve = readFileSync('app/components/ProofDemonstration.vue', 'utf8')
const specialite = readFileSync('app/pages/concours/famille/[famille]/[specialite].vue', 'utf8')
const famille = readFileSync('app/pages/concours/famille/[famille]/index.vue', 'utf8')
const carteEpreuve = readFileSync('app/components/CarteEpreuve.vue', 'utf8')
const annonces = JSON.parse(readFileSync('server/assets/annonces-2026-08-08.json', 'utf8'))

const question = {
  question: { uuid: 'question-1', stem: 'Énoncé' },
  options: [{ position: 1 }, { position: 2 }],
}

assert.equal(contientQuestionDemonstration(question), true)
assert.equal(contientQuestionDemonstration(null), false)
assert.equal(contientQuestionDemonstration({ question: question.question, options: [] }), false)
assert.equal(contientQuestionDemonstration({ question: { uuid: '', stem: '' }, options: question.options }), false)

assert.match(
  accueil,
  /<button\s+v-if="demonstrationDisponible"[\s\S]{0,180}?heros__essayer/,
  '« Essayer la question » doit dépendre de la disponibilité réelle',
)
assert.match(
  preuve,
  /emit\('disponibilite',\s*valeur\)/,
  'la démonstration doit transmettre sa disponibilité au héros',
)
assert.doesNotMatch(
  specialite,
  /a\.naja7i\.filiere\s*===\s*['"]education['"]/,
  'une spécialité ne doit pas afficher tous les concours de la filière éducation',
)
assert.match(
  specialite,
  /a\.naja7i\.prep_slug\s*===\s*specialiteVisee\.value/,
  'une annonce de spécialité doit être rattachée par son prep_slug exact',
)
assert.match(
  specialite,
  /v-if="ouverte\s*&&\s*demonstrationDisponible"/,
  'la fiche de spécialité ne doit promettre une correction que si elle existe',
)
assert.doesNotMatch(
  carteEpreuve,
  /disponible:\s*true/,
  'une carte d’épreuve ne doit jamais supposer le diagnostic disponible',
)
assert.match(
  famille,
  /:disponible="diagnosticDisponible\(epreuve\.code\)"/,
  'la fiche de famille doit transmettre diagnostic_ready à chaque épreuve',
)
assert.match(
  preuve,
  /preuve__actes[\s\S]{0,500}?\/concours[\s\S]{0,500}?\/se-preparer/,
  'le repli doit conserver ses portes vers les concours et la méthode',
)

const rattachements = new Map(
  annonces
    .filter(annonce => annonce.naja7i?.prep_slug)
    .map(annonce => [annonce.slug, annonce.naja7i.prep_slug]),
)

assert.equal(
  rattachements.get('professeur-de-l-enseignement-secondaire-qualifiant-francais-0cfb4a'),
  'crmef/langue-francaise-secondaire',
)
assert.equal(
  rattachements.get('professeur-de-l-enseignement-secondaire-qualifiant-mathemati-4d1d28'),
  'crmef/mathematiques-secondaire',
)
assert.equal(
  [...rattachements.values()].some(slug => ['crmef/francais', 'crmef/mathematiques'].includes(slug)),
  false,
  'aucun ancien rattachement CRMEF ne doit subsister',
)

console.log('  ok  CTA de démonstration conditionné à une question réelle')
console.log('  ok  repli de démonstration pourvu de portes utiles')
console.log('  ok  annonces d’une spécialité limitées à ses rattachements explicites')
console.log('  ok  portes diagnostic et correction fermées en l’absence de contenu')
console.log('  ok  rattachements français et mathématiques dirigés vers les slugs actuels')
