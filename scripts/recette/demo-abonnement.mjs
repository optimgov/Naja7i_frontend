#!/usr/bin/env node
/**
 * demo-abonnement.mjs — LA VISITE COMMERCIALE, préparée puis guidée.
 *
 *   node scripts/recette/demo-abonnement.mjs           prépare et affiche le chemin
 *   node scripts/recette/demo-abonnement.mjs --valider  joue le rôle de l'équipe
 *   node scripts/recette/demo-abonnement.mjs --rendre   remet le compte à zéro
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE N'EST PAS UNE RECETTE, ET LA DIFFÉRENCE EST ENTIÈRE
 *
 * `recette-abonnement.mjs` PROUVE — elle clique elle-même, elle mesure, elle
 * rend un code de sortie. Ce script-ci ne prouve rien : il POSE L'ÉTAT qui rend
 * la démonstration possible, puis il s'efface. Les clics sont ceux de l'humain
 * qui montre le produit.
 *
 * Les deux existent parce qu'une démonstration a une contrainte que la recette
 * n'a pas : elle se joue devant quelqu'un, une seule fois, sans reprise. Tout ce
 * qui peut être préparé à l'avance doit l'être — un mur payant qui ne s'affiche
 * pas parce que le quota gratuit n'était pas épuisé transforme la démonstration
 * en séance de débogage.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IL NE FABRIQUE AUCUN DROIT
 *
 * Le coupon est tiré par le générateur du produit ; la validation passe par
 * `AbonnementService::honorer()`, comme le bouton du back-office. Une
 * démonstration qui poserait les octrois en SQL montrerait un écran vrai sur un
 * chemin faux — et le jour où ce chemin casse, elle continuerait de bien se
 * passer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE TEMPS HUMAIN EST LA MOITIÉ DE LA DÉMONSTRATION
 *
 * Le coupon a DEUX temps, et le second est un humain qui vérifie un virement.
 * C'est la décision de produit qui rend le revenu possible sans prestataire de
 * paiement — donc ce qu'il faut montrer, pas ce qu'il faut cacher. Le script
 * s'arrête après la saisie et attend qu'on lui demande la validation : c'est le
 * seul moment où l'on voit ce que le candidat voit pendant l'attente.
 */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { client } from './client-api.mjs'

const ICI = dirname(fileURLToPath(import.meta.url))
const FRONT = resolve(ICI, '../..')

const API = process.env.API_BASE_URL || 'http://localhost:8000'
const WEB = process.env.BASE_URL || 'http://localhost:3000'
const BACKEND = process.env.BACKEND_DIR || resolve(FRONT, '../Naja7i_backend_front')

const COMPTE = process.env.COMPTE_EMAIL || 'recette.a@naja7i.test'
const MOT_DE_PASSE = process.env.COMPTE_MOTDEPASSE || 'Recette-FRONT3-2026!'

const valider = process.argv.includes('--valider')
const rendre = process.argv.includes('--rendre')

const gras = s => `\u001b[1m${s}\u001b[0m`
const vert = s => `\u001b[32m${s}\u001b[0m`
const doux = s => `\u001b[2m${s}\u001b[0m`

function tinker(fichier, env = {}) {
  const r = spawnSync('php', ['artisan', 'tinker', `${ICI}/${fichier}`], {
    cwd: BACKEND,
    encoding: 'utf8',
    env: { ...process.env, ...env, OBJC_DISABLE_INITIALIZE_FORK_SAFETY: 'YES' },
  })

  const sortie = ((r.stdout ?? '') + (r.stderr ?? '')).trim()

  /* Même règle que l'orchestrateur : `tinker` rend 0 même quand le script lève,
   * donc le code de sortie ne vaut rien — on lit ce qui a été écrit. */
  if (/Exception|Fatal|ÉCHEC|Crashing|\bError\b/i.test(sortie) || sortie === '') {
    console.error(`\n  Préparation en échec (${fichier}) :\n${sortie || '  (aucune sortie)'}\n`)
    process.exit(1)
  }

  return sortie
}

async function serviceDebout(url, quoi) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(3000) })
    return true
  }
  catch {
    console.error(`\n  ${quoi} ne répond pas sur ${url}.`)
    console.error('  Lancez la démonstration d’abord :  cd ~/Coding && ./naja7i-demo.sh\n')
    return false
  }
}

if (!(await serviceDebout(`${API}/up`, 'L’API')) || !(await serviceDebout(`${WEB}/fr`, 'Le frontend'))) {
  process.exit(1)
}

// ───────────────────────────────────────────── remettre à zéro
if (rendre) {
  console.log(gras('\n── Remise à zéro du compte de démonstration ──\n'))
  console.log(tinker('remettre-quota.php', { COMPTE_EMAIL: COMPTE }))
  console.log(`\n${vert('Fait')} — ${COMPTE} est de nouveau un candidat gratuit,`)
  console.log('  quota entier, sans abonnement ni commande.\n')
  process.exit(0)
}

// ───────────────────────────────────────────── jouer l'équipe
if (valider) {
  console.log(gras('\n── L’équipe valide le paiement ──\n'))
  console.log(doux('  C’est ce que fait le bouton « Valider » du back-office, par le'))
  console.log(doux('  même service. Rien n’est écrit à la main dans la base.\n'))
  console.log(tinker('valider-commande.php', { COMPTE_EMAIL: COMPTE }))
  console.log(`\n${vert('À montrer maintenant')} :`)
  console.log(`  1. ${WEB}/fr/app/abonnement — l’abonnement est actif, avec son échéance`)
  console.log('  2. revenez sur la correction et RECHARGEZ — la cause est ouverte')
  console.log(doux('\n  Le mur a disparu du rendu : il n’est pas resté en coquille vide.\n'))
  process.exit(0)
}

// ───────────────────────────────────────────── préparer la visite
console.log(gras('\n── Préparation de la visite commerciale ──\n'))

/*
 * L'ÉTAT DE DÉPART EST POSÉ, PAS ESPÉRÉ.
 *
 * Le mur payant ne s'affiche que si le quota gratuit est épuisé. Sur une base
 * fraîche il ne l'est pas, et la démonstration montrerait alors une correction
 * entièrement ouverte en annonçant un mur. On l'épuise donc, et on retire un
 * éventuel abonnement laissé par une visite précédente.
 */
console.log(tinker('remettre-quota.php', { COMPTE_EMAIL: COMPTE }))
console.log(tinker('epuiser-quota.php', { COMPTE_EMAIL: COMPTE }))

const coupon = (tinker('engendrer-coupon.php').match(/NJ7(?:-[A-Z2-9]{4}){3}/) ?? [])[0]

if (!coupon) {
  console.error('\n  Aucun coupon engendré — voir la sortie ci-dessus.\n')
  process.exit(1)
}

/* L'état réel, lu par l'API : on annonce ce que le serveur dit, pas ce qu'on
 * suppose avoir posé. */
const candidat = client(API)
await candidat.connecter(COMPTE, MOT_DE_PASSE)

const etat = await candidat.appel('/api/v1/me/subscription')
const tentatives = await candidat.appel('/api/v1/me/attempts')

/*
 * ON CHERCHE UNE CORRECTION QUI PORTE UN MUR, pas simplement la dernière.
 *
 * La dernière série soumise peut ne contenir aucune erreur en attente de cause
 * — elle vient parfois d'une autre recette. On annoncerait alors un mur payant
 * sur un écran qui n'en montre pas, et la démonstration s'effondrerait devant
 * la personne à qui on la fait. Même piège que dans `recette-abonnement.mjs`,
 * et même remède : on cherche le support au lieu de le supposer.
 */
const soumises = (tentatives.corps?.data ?? []).filter(a => a.status !== 'in_progress')

let derniere = null

for (const tentative of [...soumises].reverse()) {
  const correction = await candidat.appel(`/api/v1/me/attempts/${tentative.uuid}/correction`)

  if ((correction.corps?.data ?? []).some(l => l.cause_locked)) {
    derniere = tentative
    break
  }
}

const murVisible = derniere !== null

console.log(gras('\n── L’état posé ──\n'))
console.log(`  compte              ${COMPTE}`)
console.log(`  mot de passe        ${MOT_DE_PASSE}`)
console.log(`  capacités ouvertes  ${(etat.corps?.data?.capabilities ?? []).join(', ') || 'aucune (compte gratuit)'}`)
console.log(`  commandes en attente ${etat.corps?.data?.pending_orders ?? '?'}`)
console.log(`  correction avec mur  ${murVisible ? `oui — ${WEB}/fr/app/tentative/${derniere.uuid}/correction` : 'AUCUNE'}`)
console.log(`\n  ${gras('code cadeau')}         ${gras(coupon)}`)

if (!murVisible) {
  console.log(doux('\n  Aucune correction ne porte de cause fermée : faites d’abord passer un'))
  console.log(doux('  diagnostic au candidat A, avec quelques erreurs, puis relancez ce script.'))
}

console.log(gras('\n── Le chemin à montrer ──\n'))
console.log(`  1. ${WEB}/fr/tarifs`)
console.log(doux('     Les offres viennent de l’API. On annonce ce que le candidat GAGNE —'))
console.log(doux('     « les causes de vos erreurs, sans limite » — jamais un nom de capacité.'))
console.log(doux('     Le moyen de paiement est dit ici, pas découvert au moment de payer.'))
console.log('')
console.log(`  2. ${murVisible ? `${WEB}/fr/app/tentative/${derniere.uuid}/correction` : 'la correction d’une série'}`)
console.log(doux('     Le mur payant. C’est un LIEN vers les offres, jamais un bouton grisé :'))
console.log(doux('     soit l’action est proposée, soit elle n’existe pas dans le rendu.'))
console.log('')
console.log('  3. « Choisir cette offre » → l’écran d’abonnement')
console.log(doux('     Un visiteur sans compte passe par la connexion et REVIENT ici : c’est'))
console.log(doux('     le moment exact où l’on perd un achat.'))
console.log('')
console.log(`  4. Saisir le code ${gras(coupon)}`)
console.log(doux('     « Votre code est en cours de validation. » RIEN ne s’ouvre — et c’est'))
console.log(doux('     le point à montrer : un coupon qui ouvrirait seul serait de la monnaie'))
console.log(doux('     au porteur. Rechargez la correction : la cause est toujours fermée.'))
console.log('')
console.log('  5. Côté équipe — deux façons, au choix :')
console.log(`     ${gras('node scripts/recette/demo-abonnement.mjs --valider')}`)
console.log(`     ou ${API}/admin → Commandes → Valider`)
console.log(doux('     La permission `orders.validate` est distincte de la simple lecture :'))
console.log(doux('     voir une commande et l’honorer ne sont pas le même geste.'))
console.log('')
console.log('  6. Le candidat recharge → la cause est ouverte, le mur a disparu')
console.log('')
console.log(doux(`  Pour tout remettre à zéro : node scripts/recette/demo-abonnement.mjs --rendre\n`))
