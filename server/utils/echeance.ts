/**
 * Les échéances — combien de jours reste-t-il, et DANS QUEL FUSEAU.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * BLOC-ZP1-1 (audit tournée 4) — LE DÉCOMPTE SE FAISAIT EN UTC
 *
 * Aucun fuseau candidat n'était déclaré côté Nuxt, et `opportunites.get.ts`
 * comparait des dates civiles UTC. Sur le Maroc — UTC+01 toute l'année depuis
 * 2018 — cela produisait deux erreurs mesurées :
 *
 *   — à 16h31 à Casablanca, une annonce close à 16h30 restait OUVERTE, et le
 *     restait jusqu'à 01h00 du matin : une heure entière pendant laquelle le
 *     produit invite à déposer un dossier qui ne sera pas reçu ;
 *   — à 00h30, « dans 2 jours » là où le candidat lit « demain ».
 *
 * Le compteur de la pastille, les paliers « aujourd'hui / demain » et le filtre
 * « sous 7 jours » en dépendent tous. Ce n'est pas un défaut d'affichage : c'est
 * la seule erreur de ce produit qui puisse coûter à un candidat sa candidature.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX QUESTIONS DIFFÉRENTES, DANS CET ORDRE
 *
 *   1. EST-CE FERMÉ ? C'est une question d'INSTANTS. `deadline <= maintenant`,
 *      point. Aucune notion de journée n'intervient : une échéance passée est
 *      passée, même s'il est encore « le même jour » quelque part.
 *
 *   2. DANS COMBIEN DE JOURS ? C'est une question de DATES CIVILES, et
 *      seulement pour une échéance à venir. « Clôture demain » doit vouloir dire
 *      demain, pas dans 24 heures : une échéance à 16h30 aujourd'hui reste
 *      « aujourd'hui » à 9 h du matin.
 *
 * Mélanger les deux — ce que faisait l'ancien code — donne exactement le trou
 * d'une heure : deux instants séparés par la clôture tombent dans la même
 * journée civile, et le calcul rend 0, c'est-à-dire « encore aujourd'hui ».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA MÊME CLÉ QUE LE BACKEND, PAS UNE SECONDE VÉRITÉ
 *
 * `TIMEZONE_CANDIDAT` est la variable que porte déjà `config/naja7i.php`
 * (`naja7i.timezone_candidat`, `Africa/Casablanca` par défaut), et son
 * commentaire annonçait ce branchement : « quand le module Opportunités
 * arrivera, il consomme cette clé plutôt que d'en déclarer une seconde ».
 *
 * Deux horloges pour une même échéance finissent toujours par diverger, et la
 * divergence se voit d'abord chez le candidat.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE FUSEAU DE L'HÔTE N'ENTRE JAMAIS DANS LE CALCUL
 *
 * Ni `getDate()`, ni `getHours()`, ni `toLocaleDateString()` sans `timeZone` :
 * tous lisent le fuseau du PROCESSUS. Un serveur en production tourne sous UTC,
 * un poste sous l'heure locale — le résultat changerait avec la machine, et le
 * défaut se réinstallerait au premier déploiement sans que personne le voie.
 * `Intl.DateTimeFormat` avec un `timeZone` explicite est la seule lecture qui
 * ne dépende que de l'instant. `scripts/verifier-echeances.mjs` le prouve en
 * rejouant tout sous UTC et sous UTC+14.
 */

export const TIMEZONE_CANDIDAT = process.env.TIMEZONE_CANDIDAT || 'Africa/Casablanca'

/** Les formateurs sont coûteux à construire : un par fuseau, gardé. */
const formateurs = new Map<string, Intl.DateTimeFormat>()

function formateur(fuseau: string): Intl.DateTimeFormat {
  let f = formateurs.get(fuseau)

  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuseau,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    formateurs.set(fuseau, f)
  }

  return f
}

/**
 * La date CIVILE d'un instant dans un fuseau donné, réduite à un repère
 * comparable. `Date.UTC` ne sert ici que d'arithmétique sur un triplet
 * année/mois/jour — il ne réintroduit aucun fuseau.
 */
function jourCivil(instant: Date, fuseau: string): number {
  const parts = formateur(fuseau).formatToParts(instant)
  const lire = (type: string) => Number(parts.find(p => p.type === type)?.value)

  return Date.UTC(lire('year'), lire('month') - 1, lire('day'))
}

/**
 * Jours restants jusqu'à l'échéance, du point de vue du candidat.
 *
 * Négatif = fermé. `null` = pas d'échéance connue — et l'absence ne vaut pas
 * zéro, c'est la règle du dépôt.
 *
 * @param maintenant  injectable : un décompte ne se prouve qu'aux frontières
 *                    de journée, et on ne les attend pas.
 */
export function joursRestants(
  deadline: string | null,
  maintenant: Date = new Date(),
  fuseau: string = TIMEZONE_CANDIDAT,
): number | null {
  if (!deadline) return null

  const echeance = new Date(deadline)
  if (Number.isNaN(echeance.getTime())) return null

  const ecart = Math.round(
    (jourCivil(echeance, fuseau) - jourCivil(maintenant, fuseau)) / 86_400_000,
  )

  /*
   * L'INSTANT TRANCHE EN PREMIER. Une échéance passée rend un nombre NÉGATIF,
   * y compris quand les deux instants tombent le même jour civil — c'est le
   * trou d'une heure du BLOC-ZP1-1.
   *
   * `Math.min(ecart, -1)` conserve la distance quand elle existe déjà : une
   * clôture d'il y a cinq jours reste à -5, ce dont le tri et le palier « clos »
   * ont besoin. Écraser à -1 rendrait toutes les annonces fermées équivalentes.
   */
  if (echeance.getTime() <= maintenant.getTime()) return Math.min(ecart, -1)

  return ecart
}
