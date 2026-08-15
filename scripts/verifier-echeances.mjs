#!/usr/bin/env node
/**
 * verifier-echeances.mjs — LES FRONTIÈRES DE JOURNÉE, dans le fuseau du candidat.
 *
 *   node scripts/verifier-echeances.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ON MESURE, ET POURQUOI ÇA NE SE MESURE PAS DANS LA RECETTE
 *
 * Un décompte de jours ne se prouve qu'aux FRONTIÈRES : une minute avant
 * minuit, une minute après la clôture. La recette joue à l'heure qu'il est —
 * elle passerait vingt-trois heures sur vingt-quatre sans rien voir. Il faut
 * une HORLOGE INJECTABLE, donc un test de la fonction elle-même.
 *
 * Le défaut mesuré (audit t4, BLOC-ZP1-1) : le calcul se faisait en UTC, sans
 * qu'aucun fuseau candidat soit déclaré côté Nuxt. Sur le Maroc — UTC+01 toute
 * l'année depuis 2018, hors Ramadan — cela produisait :
 *
 *   — à 16h31 Casablanca, une annonce close à 16h30 restait OUVERTE, et le
 *     restait jusqu'à 01h00 du matin ;
 *   — à 00h30, « dans 2 jours » là où le candidat lit « demain ».
 *
 * Ce n'est pas une imprécision d'affichage. C'est la seule erreur de ce produit
 * qui puisse coûter à un candidat sa candidature.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * L'INDÉPENDANCE AU FUSEAU DE L'HÔTE EST LE CŒUR DU TEST
 *
 * Un serveur en production tourne sous UTC ; un poste de développement sous
 * l'heure locale. Si le résultat dépend de cela, le défaut se réinstalle au
 * premier déploiement sans que personne le voie. Le script se relance donc
 * lui-même sous deux fuseaux d'hôte opposés — UTC et UTC+14 — et exige des
 * résultats IDENTIQUES.
 */

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { joursRestants } from '../server/utils/echeance.ts'

const MOI = fileURLToPath(import.meta.url)

/*
 * Les instants sont écrits en UTC (`Z`) : ils désignent le même point du temps
 * quel que soit le fuseau de la machine. Les écrire en heure locale ferait
 * dépendre le test de ce qu'il prétend mesurer.
 */
const CAS = [
  {
    nom: 'à 00h30 Casablanca, une échéance du surlendemain se lit « demain »',
    maintenant: '2026-08-15T23:30:00Z', // 16/08 00h30 à Casablanca
    deadline: '2026-08-17T16:30:00+01:00',
    attendu: 1,
    pourquoi: 'la date civile du candidat est le 16, celle de l’échéance le 17',
  },
  {
    nom: 'une minute AVANT la clôture, l’annonce est encore du jour',
    maintenant: '2026-08-17T15:29:00Z', // 16h29 à Casablanca
    deadline: '2026-08-17T16:30:00+01:00',
    attendu: 0,
    pourquoi: 'même journée civile, et l’instant n’est pas passé',
  },
  {
    nom: 'une minute APRÈS la clôture, l’annonce est fermée',
    maintenant: '2026-08-17T15:31:00Z', // 16h31 à Casablanca
    deadline: '2026-08-17T16:30:00+01:00',
    attendu: -1,
    pourquoi: 'l’instant est passé — la journée civile ne s’y oppose pas',
  },
  {
    nom: 'une clôture d’il y a cinq jours garde sa distance',
    maintenant: '2026-08-17T15:31:00Z',
    deadline: '2026-08-12T16:30:00+01:00',
    attendu: -5,
    pourquoi: 'fermée depuis cinq journées civiles, et le tri doit le voir',
  },
  {
    nom: 'à 23h30 Casablanca, l’échéance du lendemain se lit « demain »',
    maintenant: '2026-08-16T22:30:00Z', // 16/08 23h30 à Casablanca
    deadline: '2026-08-17T16:30:00+01:00',
    attendu: 1,
    pourquoi: 'la frontière de journée est locale, pas celle d’UTC',
  },
  {
    nom: 'une annonce sans échéance ne rend aucun nombre',
    maintenant: '2026-08-17T15:31:00Z',
    deadline: null,
    attendu: null,
    pourquoi: 'l’absence ne vaut pas zéro — c’est la règle du dépôt',
  },
]

function jouer() {
  return CAS.map(cas => ({
    ...cas,
    obtenu: joursRestants(cas.deadline, new Date(cas.maintenant)),
  }))
}

// ─────────────────────────── mode « sous-processus sous un autre fuseau »
if (process.env.ECHEANCES_FUSEAU_HOTE) {
  process.stdout.write(JSON.stringify(jouer().map(r => r.obtenu)))
  process.exit(0)
}

const resultats = jouer()
let echecs = 0

console.log('── Les frontières de journée, dans le fuseau du candidat ──\n')

for (const r of resultats) {
  const ok = r.obtenu === r.attendu
  if (!ok) echecs += 1

  console.log(`${ok ? '  ok  ' : '  ✗   '}${r.nom}`)
  console.log(`        attendu ${r.attendu} · obtenu ${r.obtenu} — ${r.pourquoi}`)
}

// ───────────────────────── le fuseau de l'HÔTE ne doit rien changer
const sousFuseau = (tz) => {
  const r = spawnSync(process.execPath, [MOI], {
    encoding: 'utf8',
    env: { ...process.env, TZ: tz, ECHEANCES_FUSEAU_HOTE: '1' },
  })
  return (r.stdout ?? '').trim()
}

const referenceLocale = JSON.stringify(resultats.map(r => r.obtenu))
const sousUtc = sousFuseau('UTC')
const sousKiritimati = sousFuseau('Pacific/Kiritimati') // UTC+14, l'écart maximal

const stable = sousUtc === referenceLocale && sousKiritimati === referenceLocale

if (!stable) echecs += 1

console.log(`${stable ? '  ok  ' : '  ✗   '}le fuseau de l’hôte ne change rien au résultat`)
console.log(`        locale ${referenceLocale}\n        UTC    ${sousUtc}`
  + `\n        UTC+14 ${sousKiritimati}`)

console.log(`\n${resultats.length + 1 - echecs}/${resultats.length + 1} contrôle(s) satisfait(s)`)
process.exit(echecs === 0 ? 0 : 1)
