import type { NuxtError } from '#app'

/**
 * UNE PANNE N'EST PAS UNE ABSENCE, et les confondre coûte un visiteur.
 *
 * Les pages du tunnel public écrivaient toutes la même ligne :
 *
 *     if (error.value || !donnee.value) throw createError({ statusCode: 404 })
 *
 * Un `404` était donc rendu pour n'importe quelle défaillance de l'API — un
 * 500, un 503 pendant un déploiement, un délai dépassé. Or `error.vue`
 * distingue déjà trois cas avec soin : introuvable, refusé, en panne. Le
 * `statusCode` qui lui permet de choisir était détruit une ligne plus haut.
 *
 * CE QUE ÇA DONNE À L'ÉCRAN. Le visiteur qui ouvre une fiche de concours
 * pendant que la préproduction se redéploie lit « cette page n'existe pas ».
 * C'est faux, et c'est la pire des trois formulations : elle ne dit pas de
 * réessayer, elle dit de renoncer. Un candidat qui a suivi un lien depuis un
 * moteur de recherche en conclut que le concours n'est pas au catalogue.
 *
 * ET LE COÛT EST RÉEL ICI. Une poussée sur `main` déploie la préproduction :
 * la fenêtre d'indisponibilité n'est pas théorique, elle s'ouvre à chaque
 * livraison.
 *
 * POURQUOI LE STATUT EST DÉJÀ LÀ, sans rien ajouter. `useAsyncData` pose
 * `error.value = createError(erreur)`, et `createError` de h3 recopie
 * `input.status` dans `statusCode` pour toute erreur qui n'est pas déjà une
 * `H3Error` — ce qui est le cas de notre `ApiRequestError`, qui porte `status`.
 * Le vrai code HTTP a donc toujours été présent dans `error.value.statusCode`.
 * Il n'était pas lu.
 *
 * LA RÈGLE « 404, JAMAIS 403 » N'EST PAS TOUCHÉE. Elle vise l'énumération des
 * ressources d'autrui, et c'est l'API qui la tient : une filière non publiée
 * répond 404, pas 403. Cette fonction ne fabrique aucun statut — elle relaie
 * celui que le serveur a choisi. Si l'API répond 404, le visiteur lit
 * « introuvable », exactement comme avant.
 *
 * @param erreur  L'erreur rendue par `useAsyncData`, ou `null` s'il n'y en a pas.
 * @param messageIntrouvable  Le libellé du 404, déjà traduit par l'appelant.
 */
export function erreurDeChargement(
  erreur: NuxtError | null | undefined,
  messageIntrouvable: string,
): NuxtError {
  /*
   * Pas d'erreur mais pas de donnée non plus : la ressource n'existe pas.
   * C'est le seul cas où ce fichier DÉCIDE d'un 404 ; partout ailleurs il
   * relaie.
   */
  const statut = erreur?.statusCode ?? 404

  if (statut === 404) {
    return createError({ statusCode: 404, statusMessage: messageIntrouvable, fatal: true })
  }

  /*
   * Le `statusMessage` n'est pas montré au visiteur — `error.vue` choisit son
   * texte sur le seul `statusCode`, dans sa langue. Il sert au journal et au
   * support, d'où le report du message d'origine quand il y en a un.
   */
  return createError({
    statusCode: statut,
    statusMessage: erreur?.statusMessage || erreur?.message || 'Chargement impossible',
    fatal: true,
  })
}
