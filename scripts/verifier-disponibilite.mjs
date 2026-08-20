#!/usr/bin/env node
/**
 * verifier-disponibilite.mjs — LES TROIS ÉTATS DU CONTRAT, INJECTÉS EXPLICITEMENT.
 *
 *   node scripts/verifier-disponibilite.mjs
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI UN CONTRÔLE HORS NAVIGATEUR
 *
 * La banque locale ne porte aujourd'hui que `open` et `waitlist`. Aucun audit
 * de rendu, aucune recette de bout en bout ne peut donc faire rougir le
 * traitement de `closed` : l'état n'apparaît sur aucun écran mesurable. C'est
 * précisément ainsi que la carte de concours a pu annoncer un concours FERMÉ
 * comme « En préparation » pendant tout un lot, sous 204 passes d'audit vertes.
 *
 * Ce script n'attend donc pas que la donnée existe : il injecte les trois
 * valeurs du contrat dans la correspondance, plus une valeur inconnue, et lit
 * ce qui en sort. Il ne demande ni serveur, ni backend, ni navigateur.
 *
 * Node exécute le module TypeScript tel quel (retrait des types, natif depuis
 * Node 22.18) — comme `recette-zone-publique.mjs` importe déjà
 * `server/utils/echeance.ts`. Aucune dépendance ajoutée.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import {
  CLES_DISPONIBILITE,
  cleDisponibilite,
  estDisponibilite,
} from '../app/utils/disponibilite.ts'

const ICI = dirname(fileURLToPath(import.meta.url))
const lire = (nom) =>
  JSON.parse(readFileSync(resolve(ICI, `../i18n/locales/${nom}.json`), 'utf8'))

const LOCALES = { fr: lire('fr'), ar: lire('ar') }

/** Les valeurs servies par le contrat public — `availability` du catalogue. */
const CONTRAT = ['open', 'waitlist', 'closed']

const resultats = []
const note = (cas, ok, constate) => {
  resultats.push({ cas, ok, constate })
  console.log(`${ok ? '  ok  ' : '  ✗   '}${cas}\n        ${constate}`)
}

/** `catalogue.dispo_closed` → la chaîne réellement servie, ou `undefined`. */
const traduire = (langue, cle) =>
  cle.split('.').reduce((n, p) => (n == null ? undefined : n[p]), LOCALES[langue])

console.log('# Disponibilité du catalogue — les trois états du contrat\n')

// ══════════════════ 1. La correspondance couvre le contrat, exactement ═══
{
  const couvertes = Object.keys(CLES_DISPONIBILITE).sort()
  const attendues = [...CONTRAT].sort()

  note(
    'D1 — la correspondance couvre les trois valeurs du contrat, et rien de plus',
    JSON.stringify(couvertes) === JSON.stringify(attendues),
    `couvertes : ${couvertes.join(', ')} · attendues : ${attendues.join(', ')}`,
  )
}

// ═══════════ 2. Chaque état injecté rend un libellé écrit, dans les 2 langues ═══
{
  for (const etat of CONTRAT) {
    const cle = cleDisponibilite(etat)

    if (!cle) {
      note(`D2·${etat} — l'état rend une clé de libellé`, false, 'aucune clé rendue')
      continue
    }

    const mots = Object.fromEntries(
      Object.keys(LOCALES).map((l) => [l, traduire(l, cle)]),
    )

    const manquantes = Object.entries(mots)
      .filter(([, m]) => typeof m !== 'string' || m.trim() === '')
      .map(([l]) => l)

    /* Le libellé ne doit contenir aucun reste du code : « waitlist » écrit dans
       la traduction serait le même aveu qu'un repli sur le code brut. */
    const fuite = Object.entries(mots)
      .filter(([, m]) => typeof m === 'string' && m.toLowerCase().includes(etat))
      .map(([l]) => l)

    note(
      `D2·${etat} — injecté, il rend un libellé écrit en FR et en AR`,
      manquantes.length === 0 && fuite.length === 0,
      manquantes.length
        ? `clé ${cle} absente de : ${manquantes.join(', ')}`
        : fuite.length
          ? `le code « ${etat} » apparaît dans le libellé : ${fuite.join(', ')}`
          : `${cle} → fr « ${mots.fr} » · ar « ${mots.ar} »`,
    )
  }
}

// ═════════ 3. `closed` ne se confond avec AUCUN autre état, dans les 2 langues ═══
{
  /*
   * LE CŒUR DU DÉFAUT CORRIGÉ. « Fermé » replié sur « En préparation » n'était
   * pas une nuance de vocabulaire : un candidat qui lit « En préparation »
   * attend une ouverture, et ne saurait pas qu'il vient de manquer la sienne.
   * Deux états distincts du contrat doivent donc porter deux mots distincts.
   */
  for (const langue of Object.keys(LOCALES)) {
    const mots = CONTRAT.map((e) => [e, traduire(langue, CLES_DISPONIBILITE[e])])
    const distincts = new Set(mots.map(([, m]) => m))

    note(
      `D3·${langue} — les trois états portent trois libellés distincts`,
      distincts.size === CONTRAT.length,
      mots.map(([e, m]) => `${e} = « ${m} »`).join(' · '),
    )
  }
}

// ══════════════════════ 4. Une valeur inconnue ne fuit jamais à l'écran ═══
{
  const intrus = ['archived', 'OPEN', '', 'toString', 'constructor']
  const fuites = intrus.filter((v) => cleDisponibilite(v) !== null || estDisponibilite(v))

  note(
    'D4 — une valeur hors contrat ne rend aucune clé (jamais le code brut)',
    fuites.length === 0,
    fuites.length
      ? `valeurs acceptées à tort : ${fuites.join(', ')}`
      : `${intrus.length} valeur(s) refusée(s), dont les noms de la chaîne de prototypes`,
  )
}

// ═══════════ 5. Aucune surface ne refabrique la correspondance dans son coin ═══
{
  /*
   * Le défaut est né de quatre traductions parallèles du même code. Le contrôle
   * porte donc aussi sur l'ABSENCE de correspondance locale : une clé
   * `catalogue.dispo_` construite ailleurs qu'ici rouvrirait la divergence.
   */
  const SURFACES = [
    'app/components/CarteConcours.vue',
    'app/components/MegaConcours.vue',
    'app/components/PaletteRecherche.vue',
    'app/pages/recherche.vue',
  ]

  const coupables = SURFACES.filter((f) =>
    /catalogue\.dispo_|catalogue\.(ouvert|en_preparation)/.test(
      readFileSync(resolve(ICI, '..', f), 'utf8'),
    ),
  )

  note(
    'D5 — aucune surface ne fabrique une clé de disponibilité chez elle',
    coupables.length === 0,
    coupables.length
      ? `correspondance locale retrouvée dans : ${coupables.join(', ')}`
      : `${SURFACES.length} surface(s) passent par app/utils/disponibilite.ts`,
  )
}

const echecs = resultats.filter((r) => !r.ok)
console.log(`\n── ${resultats.length - echecs.length}/${resultats.length} cas conformes ──`)
process.exit(echecs.length === 0 ? 0 : 1)
