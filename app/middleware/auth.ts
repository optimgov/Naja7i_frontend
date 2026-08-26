/**
 * Garde de route.
 *
 * Rappel qui doit rester visible dans le code : cette garde est un CONFORT
 * D'INTERFACE, pas une sécurité. Le serveur reste seul juge — toute route API
 * protégée refuse déjà les requêtes non authentifiées. Retirer cette garde
 * n'ouvrirait aucun accès, cela dégraderait seulement l'expérience.
 *
 * ELLE EMPORTE MAINTENANT LA DESTINATION. Elle renvoyait vers `/connexion`
 * sans dire où l'on allait : un visiteur qui ouvrait `/app/diagnostic/CRMEF-…`
 * — depuis `/se-preparer`, depuis une fiche de famille, ou depuis un lien reçu
 * — se connectait puis atterrissait sur un tableau de bord vide, à charge pour
 * lui de retrouver seul son épreuve. C'est le maillon qui manquait à la chaîne
 * `?suite=`, et il était côté garde, pas côté écran.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, needsVerification, isStaff, isCandidate, user, fetchMe } = useAuth()
  const localePath = useLocalePath()

  if (!isAuthenticated.value) {
    await fetchMe()
  }

  if (!isAuthenticated.value) {
    return navigateTo(avecSuite(localePath('/connexion'), to.fullPath))
  }

  if (isStaff.value) {
    return navigateTo('/admin', { external: true })
  }

  if (needsVerification.value && !to.path.includes('verifier-email')) {
    return navigateTo(avecSuite(localePath('/verifier-email'), to.fullPath))
  }

  const dossier = localePath('/app/mon-dossier')
  if (isCandidate.value && !user.value?.onboarding_complete && to.path !== dossier) {
    return navigateTo(avecSuite(dossier, to.fullPath))
  }
})
