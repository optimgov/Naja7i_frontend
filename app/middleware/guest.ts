/**
 * Renvoie un candidat déjà connecté vers son espace — ou vers sa suite.
 *
 * Un candidat connecté qui suit un lien `/connexion?suite=…` — reçu par
 * message, ou posé par une surface publique qui ne sait pas encore s'il a une
 * session — était renvoyé sur `/app`. Il perdait sa destination pour la seule
 * raison qu'il était DÉJÀ connecté, c'est-à-dire dans le cas le plus favorable.
 *
 * `suiteInterne` exclut les cinq écrans du tunnel d'authentification : sans
 * cela, `?suite=/fr/connexion` ferait tourner cette garde en rond.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, isStaff, fetchMe } = useAuth()
  const localePath = useLocalePath()

  if (!isAuthenticated.value) await fetchMe()

  if (isAuthenticated.value) {
    if (isStaff.value) return navigateTo('/admin', { external: true })

    return navigateTo(suiteInterne(to.query.suite) ?? localePath('/app'))
  }
})
