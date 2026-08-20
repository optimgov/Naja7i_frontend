/**
 * Les opportunités — FIXTURE, servie par le BFF depuis un fichier.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE ROUTE EXISTE, ET CE QU'ELLE DEVIENDRA
 *
 * Le module Opportunités se construit dans un autre dépôt. Le CONTRAT DE
 * DONNÉES est déjà celui du collecteur — les 29 annonces du 8 août 2026 en
 * sont une capture réelle, pas un jeu inventé. Il n'y a donc rien à réécrire
 * au branchement : seul le POINT DE LECTURE change, et il vit désormais dans
 * `server/utils/opportunites.ts`, partagé avec la recherche globale.
 *
 * Elle n'est pas sous `/api/`, et ce n'est pas un détail : `server/routes/api/
 * [...].ts` relaie TOUT ce préfixe vers Laravel. Une route de fixture posée là
 * serait tantôt servie, tantôt relayée, selon l'ordre de résolution de Nitro —
 * exactement le genre de panne qu'on ne diagnostique pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `jours` EST RECALCULÉ ICI, ET C'EST LA DÉCISION QUI COMPTE
 *
 * Le collecteur sert un champ `jours` — un nombre de jours jusqu'à l'échéance,
 * calculé À L'INSTANT DE LA COLLECTE. C'est une valeur PÉRISSABLE, et la
 * fixture le démontre : capturée le 8 août, elle annonce encore ouvertes trois
 * annonces dont l'échéance est passée depuis. L'une d'elles est le concours de
 * professeur des écoles — celui que le plus de candidats attendent.
 *
 * Afficher « Clôture dans 1 jour » sur un dépôt fermé depuis cinq jours n'est
 * pas une imprécision d'affichage : c'est la seule erreur de ce produit qui
 * puisse coûter à un candidat sa candidature. On recalcule donc depuis
 * `deadline`, qui est une DATE et ne périme pas.
 *
 * La forme rendue est inchangée — le client lit toujours `jours`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `joursRestants` VIT DANS `server/utils/echeance.ts` — audit t4, BLOC-ZP1-1.
 *
 * Il était ici, et il comptait en dates civiles UTC : à 16h31 à Casablanca une
 * annonce close à 16h30 restait ouverte jusqu'à 01h00. Un décompte ne se prouve
 * qu'aux FRONTIÈRES de journée, donc avec une horloge injectable — tant que la
 * fonction vivait dans un gestionnaire de route, elle n'était atteignable qu'à
 * l'heure qu'il est. `scripts/verifier-echeances.mjs` l'éprouve aux deux
 * minutes qui comptent, et sous deux fuseaux d'hôte.
 */

export default defineEventHandler(async (event) => {
  const annonces = (await lireAnnonces()).map(a => ({ ...a, jours: joursRestants(a.deadline) }))

  /* `no-store` : `jours` est calculé à l'instant de la réponse. Mise en cache,
   * elle rendrait un décompte faux — et d'autant plus faux qu'elle serait
   * gardée longtemps. Même raison que `seconds_remaining` sur une tentative. */
  setResponseHeader(event, 'cache-control', 'no-store')

  return {
    data: annonces,
    meta: {
      /* MARQUÉ COMME FIXTURE, et le marqueur est CONTRACTUEL : l'interface
       * l'affiche, et si le serveur cesse un jour de le servir, la mention
       * disparaît de l'écran — elle ne se replie pas sur une valeur en dur.
       * C'est la règle « aucun repli en dur sur un marqueur contractuel ». */
      fixture: true,
      /* LE FUSEAU EST DIT, parce que `jours` n'a de sens que rapporté à une
       * horloge. Un client — ou une recette — qui recalculerait sans le savoir
       * poserait une seconde vérité, et c'est exactement ce qui a laissé passer
       * le BLOC-ZP1-1 : les deux côtés se trompaient ensemble. */
      timezone_candidat: TIMEZONE_CANDIDAT,
      collecte: '2026-08-08T10:00:00+01:00',
      source: 'Portail de l’emploi public (MMSP) — capture du 8 août 2026',
      total: annonces.length,
    },
  }
})
