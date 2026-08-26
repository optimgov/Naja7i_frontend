export default defineNuxtRouteMiddleware(async (to) => {
  if (to.query.espace !== 'candidat') return

  const { isAuthenticated, needsVerification, isCandidate, user, fetchMe } = useAuth()
  const localePath = useLocalePath()

  if (!isAuthenticated.value) await fetchMe()
  if (!isAuthenticated.value) return navigateTo(avecSuite(localePath('/connexion'), to.fullPath))
  if (needsVerification.value) return navigateTo(avecSuite(localePath('/verifier-email'), to.fullPath))
  if (isCandidate.value && !user.value?.onboarding_complete) {
    return navigateTo(avecSuite(localePath('/app/mon-dossier'), to.fullPath))
  }

  setPageLayout('app')
})
