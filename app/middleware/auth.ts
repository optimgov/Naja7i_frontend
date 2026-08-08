/**
 * Garde de route.
 *
 * Rappel qui doit rester visible dans le code : cette garde est un CONFORT
 * D'INTERFACE, pas une sécurité. Le serveur reste seul juge — toute route API
 * protégée refuse déjà les requêtes non authentifiées. Retirer cette garde
 * n'ouvrirait aucun accès, cela dégraderait seulement l'expérience.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, needsVerification, fetchMe } = useAuth()
  const localePath = useLocalePath()

  if (!isAuthenticated.value) {
    await fetchMe()
  }

  if (!isAuthenticated.value) {
    return navigateTo(localePath('/connexion'))
  }

  if (needsVerification.value && !to.path.includes('verifier-email')) {
    return navigateTo(localePath('/verifier-email'))
  }
})
