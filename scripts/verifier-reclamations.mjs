#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  creerCleIdempotence,
  ordonnerMessagesChronologiquement,
} from '../app/composables/useReclamations.ts'

const composable = readFileSync('app/composables/useReclamations.ts', 'utf8')
const liste = readFileSync('app/pages/app/reclamations/index.vue', 'utf8')
const fil = readFileSync('app/pages/app/reclamations/[uuid].vue', 'utf8')
const layout = readFileSync('app/layouts/app.vue', 'utf8')
const fr = JSON.parse(readFileSync('i18n/locales/fr.json', 'utf8'))
const ar = JSON.parse(readFileSync('i18n/locales/ar.json', 'utf8'))

assert.equal(composable.includes('$fetch'), false, 'useReclamations doit passer exclusivement par useApi')

for (const contrat of [
  "api.get<ListeReclamations>('/me/complaints'",
  "api.post<{ data: Reclamation }>('/me/complaints'",
  "api.get<{ data: Reclamation }>(`/me/complaints/${encodeURIComponent(uuid)}`)",
  'api.get<ListeMessagesReclamation>(',
  "`/me/complaints/${encodeURIComponent(uuid)}/messages`",
  '{ page }',
  "{ 'Idempotency-Key': cleIdempotence }",
]) {
  assert.ok(composable.includes(contrat), `contrat API absent : ${contrat}`)
}

assert.ok(layout.includes("localePath('/app/reclamations')"), 'la navigation candidat doit exposer les réclamations')

for (const page of [liste, fil]) {
  assert.ok(page.includes("layout: 'app', middleware: 'auth'"), 'chaque écran doit être protégé par le layout candidat')
  assert.ok(page.includes('ApiRequestError'), 'chaque écran doit traiter ApiRequestError')
  assert.ok(page.includes('dir="auto"'), 'les chaînes venant de l’API doivent porter dir="auto"')
}

assert.ok(liste.includes('creerCleIdempotence()'), 'la création doit porter une clé par intention')
assert.ok(fil.includes('creerCleIdempotence()'), 'la réponse doit porter une clé par intention')
assert.ok(fil.includes("message.sender === 'staff' ? t('reclamations.equipe')"), 'aucune identité staff ne doit être exposée')
assert.ok(fil.includes('conversation.links'), 'le fil doit conserver les liens de pagination Laravel')
assert.ok(fil.includes('conversation.meta'), 'le fil doit conserver les métadonnées de pagination Laravel')
assert.ok(fil.includes('aDesMessagesPrecedents'), 'le fil doit exposer les messages précédents')
assert.ok(fil.includes('aDesMessagesSuivants'), 'le fil doit exposer les messages suivants')
assert.equal(liste.includes('{{ reclamation.category }}'), false, 'un code de catégorie ne doit pas être rendu')
assert.equal(liste.includes('{{ reclamation.status }}'), false, 'un code de statut ne doit pas être rendu')

assert.deepEqual(Object.keys(fr.reclamations).sort(), Object.keys(ar.reclamations).sort(), 'les clés FR/AR doivent être paritaires')

const cles = new Set(Array.from({ length: 100 }, () => creerCleIdempotence()))
assert.equal(cles.size, 100, 'les clés d’idempotence doivent être uniques')
for (const cle of cles) assert.ok(cle.length >= 20, 'une clé d’idempotence ne doit pas être triviale')

const messagesDesordonnes = [
  { uuid: 'trois', sender: 'staff', body: 'Trois', created_at: '2026-08-24T12:03:00Z' },
  { uuid: 'un', sender: 'candidate', body: 'Un', created_at: '2026-08-24T12:01:00Z' },
  { uuid: 'deux', sender: 'staff', body: 'Deux', created_at: '2026-08-24T12:02:00Z' },
]
const messagesOrdonnes = ordonnerMessagesChronologiquement(messagesDesordonnes)
assert.deepEqual(messagesOrdonnes.map(message => message.uuid), ['un', 'deux', 'trois'], 'chaque page doit se lire dans l’ordre chronologique')
assert.deepEqual(messagesDesordonnes.map(message => message.uuid), ['trois', 'un', 'deux'], 'le tri ne doit pas modifier la réponse API')

console.log('ok — contrat paginé, ordre chronologique, idempotence, confidentialité staff et parité FR/AR vérifiés')
