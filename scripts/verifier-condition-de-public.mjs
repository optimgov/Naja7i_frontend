#!/usr/bin/env node
/**
 * verifier-condition-de-public.mjs — LA RÈGLE DU PAS 5, ÉPROUVÉE.
 *
 *   npm run publics
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 *
 * `conditionDePublic()` décide deux choses d'un coup : ce que l'écran DIT, et
 * si le bouton d'achat EXISTE. Se tromper d'un côté se voit ; se tromper de
 * l'autre se compte en ventes perdues, et en silence.
 *
 * Or la règle ne peut pas être observée sur le catalogue actuel : il n'existe
 * qu'UNE catégorie de public (`crmef`), et aucune épreuve d'une autre famille.
 * Le cas « conditions différentes » — celui pour lequel tout ce lot a été écrit
 * — est donc INJOUABLE dans un navigateur aujourd'hui. Un contrôle qui ne peut
 * pas rougir ne prouve rien : on éprouve donc la règle elle-même, ici, où les
 * quatre cas sont tous atteignables.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE PIÈGE QUE CE FICHIER EXISTE POUR TENIR FERMÉ
 *
 * La forme courte qui vient naturellement à l'esprit est FAUSSE :
 *
 *     const eligible = !plan.audience
 *       || (profile.audience && plan.audience.code === profile.audience.code)
 *
 * Offre avec public, profil SANS catégorie : cette expression vaut `undefined`,
 * donc « non éligible », donc bouton fermé. C'est l'exact contraire de la règle
 * — `audience` absente sur un profil veut dire « on ne sait pas », jamais « non
 * éligible ». Fermer là-dessus serait PLUS STRICT QUE LE SERVEUR, qui ne refuse
 * que ce qu'il sait.
 *
 * Et ce n'est pas une subtilité de coin : MESURÉ sur la base de recette, les
 * trois offres portent un public et AUCUN compte candidat n'a d'épreuve
 * déclarée. La forme courte retirerait donc les trois boutons à tout candidat
 * connecté — le catalogue entier deviendrait inachetable, sans qu'aucun écran
 * ne rougisse.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { conditionDePublic } from '../app/utils/publicVise.ts'

const crmef = { code: 'crmef', label_fr: 'CRMEF', label_ar: 'المراكز الجهوية' }
const autre = { code: 'licences', label_fr: 'Licences d’éducation', label_ar: 'إجازات التربية' }

const cas = []
const eprouver = (nom, effectif, attendu) => {
  assert.deepEqual(effectif, attendu, nom)
  cas.push(nom)
}

// ─────────────────────────────────────────────── les quatre cas de la règle

eprouver(
  'offre SANS public → proposée, et rien n’est dit (une certitude : elle est ouverte à tous)',
  conditionDePublic(undefined, crmef),
  null,
)

eprouver(
  'offre sans public ET candidat sans catégorie → proposée',
  conditionDePublic(undefined, undefined),
  null,
)

eprouver(
  'mêmes catégories → proposée, et rien n’est dit (l’offre lui est destinée)',
  conditionDePublic(crmef, crmef),
  null,
)

eprouver(
  'catégories DIFFÉRENTES → c’est le seul cas où l’on parle, et l’offre à annoncer sort',
  conditionDePublic(crmef, autre),
  crmef,
)

// ─────────────────────────────────────── le piège, nommé et tenu fermé

eprouver(
  'PIÈGE — offre avec public, candidat sans catégorie → PROPOSÉE : « on ne sait pas »'
  + ' n’est pas « non éligible », et fermer serait plus strict que le serveur',
  conditionDePublic(crmef, undefined),
  null,
)

/* On rend l'OFFRE, pas la catégorie du candidat : la phrase dit à qui l'offre
 * est réservée, jamais qui est le candidat. Servir la seconde écrirait
 * « réservée aux licences » sur une offre CRMEF. */
eprouver(
  'la catégorie annoncée est celle de l’OFFRE, jamais celle du candidat',
  conditionDePublic(crmef, autre)?.code,
  'crmef',
)

// ──────────────────────────────────── ce que l'écran en fait, lu à la source

const page = readFileSync('app/pages/tarifs.vue', 'utf8')

/*
 * LA MENTION SE LIT AVANT LE BOUTON — et c'est de l'accessibilité, pas de la
 * mise en page. Un lecteur d'écran qui annonce l'action avant sa condition
 * inverse l'ordre de la décision. On compare donc leurs positions dans le
 * fichier, seule façon de faire rougir un déplacement.
 */
const posMention = page.indexOf('offre__public')
const posBouton = page.indexOf('offre.proposable')

assert.notEqual(posMention, -1, 'la mention de public a disparu du gabarit')
assert.notEqual(posBouton, -1, 'le bouton ne dépend plus de `offre.proposable`')
assert.ok(
  posMention < posBouton,
  'la mention de public doit précéder le bouton DANS LE DOM : un lecteur d’écran'
  + ' qui annonce l’action avant sa condition inverse l’ordre de la décision',
)
cas.push('la mention précède le bouton dans le DOM')

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LES DEUX CHEMINS D'ARRIVÉE DOIVENT DONNER LE MÊME ÉCRAN — critère du pas 5
 *
 * Un candidat atteint `/tarifs` de deux façons : en ouvrant l'adresse (rendu
 * SERVEUR) ou depuis un écran authentifié (navigation CLIENT). Le même compte
 * doit y voir la même chose. Ce qui le garantit tient en deux propriétés de la
 * source, et c'est celles-là qu'on tient fermées ici — le rendu, lui, est
 * mesuré dans un vrai navigateur par `recette-abonnement.mjs`.
 *
 * 1. LA DÉCISION EST PRISE PENDANT `setup`, jamais après. Un `onMounted` ou un
 *    `watch` qui irait chercher le profil ne s'exécuterait QUE côté client :
 *    l'entrée directe rendrait alors un écran sans mention, et la navigation
 *    interne un écran avec — le défaut exact que ce critère interdit. Pire, le
 *    bouton disparaîtrait sous le curseur après hydratation.
 *
 * 2. LES DEUX CÔTÉS RÉPONDENT À LA MÊME QUESTION. Le serveur ne peut pas lire
 *    `isAuthenticated` (rien n'appelle `fetchMe()` sur une surface publique) et
 *    le client ne peut pas lire le cookie (`naja7i-session` est `HttpOnly`).
 *    Chacun a donc SA façon de savoir s'il y a une session, et les deux doivent
 *    être présentes : n'en garder qu'une rendrait un des deux chemins aveugle.
 */
assert.match(
  page,
  /const\s*\{\s*data:\s*profilCandidat\s*\}\s*=\s*peutAvoirUnProfil[\s\S]{0,160}?await profil\(\)/,
  'la lecture du profil doit être une constante de `setup` : c’est ce qui la fait'
  + ' exécuter AUSSI au rendu serveur, donc donner le même écran par les deux'
  + ' chemins d’arrivée',
)

/* `[\s\S]` et non `[^)]` : le corps d'un `onMounted(async () => …)` contient
 * des parenthèses avant d'atteindre l'appel, et une classe qui les exclut
 * s'arrête à la première. Écrite ainsi, la garde ne rougissait sur RIEN —
 * vérifié en y injectant la régression qu'elle prétend attraper. */
assert.doesNotMatch(
  page,
  /(onMounted|onBeforeMount|watchEffect|watch)\s*\([\s\S]{0,400}?profil\(\)/,
  'le profil ne doit pas être lu depuis un crochet de cycle de vie : cela ne'
  + ' s’exécuterait que côté client, et les deux chemins d’arrivée donneraient'
  + ' des écrans différents pour le même compte — le bouton disparaîtrait même'
  + ' sous le curseur après hydratation',
)

assert.match(
  page,
  /import\.meta\.server[\s\S]{0,200}naja7i-session/,
  'le rendu SERVEUR doit reconnaître la session par le cookie entrant :'
  + ' `isAuthenticated` y est toujours faux sur une surface publique',
)

assert.match(
  page,
  /import\.meta\.server[\s\S]{0,120}:\s*isAuthenticated\.value/,
  'le rendu CLIENT doit reconnaître la session par `isAuthenticated` :'
  + ' `naja7i-session` est HttpOnly, donc illisible depuis le navigateur',
)
cas.push('les deux chemins d’arrivée savent reconnaître la session')

/*
 * UN REFUS N'EST PAS UNE ERREUR D'ÉCRAN. Cookie périmé → 401 → catégorie
 * INCONNUE → toutes les offres proposées. La page ne doit pas afficher de
 * bandeau d'erreur pour cela : le candidat n'a rien fait de mal, et l'écran
 * public est le bon rendu. Mesuré : HTTP 200, 3 boutons, 0 mention.
 */
assert.doesNotMatch(
  page,
  /erreurProfil|erreur:\s*erreurProfil/,
  'un profil illisible ne doit pas devenir un état d’erreur de l’écran :'
  + ' il vaut « catégorie inconnue », donc toutes les offres proposées',
)
cas.push('un profil illisible vaut « inconnu », jamais une erreur')

/*
 * AUCUN BOUTON GRISÉ. « Le mur payant est un champ, pas une route » : soit
 * l'action est proposée, soit elle n'existe pas dans le rendu. Un bouton
 * désactivé reconstituerait le 403 en français.
 */
assert.doesNotMatch(
  page,
  /class="btn btn--bloc"[^>]*\b(disabled|aria-disabled)\b/,
  'le bouton d’achat ne doit jamais être rendu désactivé — il est rendu, ou absent',
)
cas.push('aucun bouton d’achat désactivé')

// ─────────────────────────────────────────────────── la phrase, des deux côtés

const fr = JSON.parse(readFileSync('i18n/locales/fr.json', 'utf8'))
const ar = JSON.parse(readFileSync('i18n/locales/ar.json', 'utf8'))

for (const [langue, dico] of [['fr', fr], ['ar', ar]]) {
  const phrase = dico.tarifs?.reservee

  assert.ok(phrase, `tarifs.reservee manque en ${langue}`)
  assert.ok(
    phrase.includes('{public}'),
    `tarifs.reservee doit interpoler {public} en ${langue} — le nom vient de l’API,`
    + ' jamais du gabarit',
  )
  /* Pas de HTML dans les messages : le compilateur le refuse, et c'est une
   * surface d'injection. */
  assert.doesNotMatch(phrase, /<[^>]+>/, `tarifs.reservee ne doit pas porter de HTML (${langue})`)
}
cas.push('la mention existe en FR et en AR, interpolée et sans HTML')

console.log(`ok — ${cas.length} contrôle(s) :`)
for (const nom of cas) console.log(`  · ${nom}`)
