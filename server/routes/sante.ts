/**
 * Sonde de vivacité du BFF.
 *
 * Pourquoi une route dédiée plutôt que `/fr/connexion`, qui semblait faire
 * l'affaire : `connexion.vue` déclare `middleware: 'guest'`, et ce middleware
 * appelle `fetchMe()` à chaque rendu serveur. Chaque sonde partait donc dans
 * le relais, atteignait Laravel, ouvrait une session dans Redis — huit fois
 * par minute et par conteneur, entre Docker et Caddy — et déclarait le
 * frontend malade dès que l'API redémarrait, alors que lui allait bien.
 *
 * Ce gestionnaire ne rend aucune page et n'appelle rien : il répond si, et
 * seulement si, le serveur Nitro est vivant. C'est exactement ce qu'une sonde
 * de conteneur doit mesurer.
 */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'cache-control', 'no-store')
  return 'ok'
})
