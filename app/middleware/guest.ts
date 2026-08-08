/** Renvoie un candidat déjà connecté vers son espace. */
export default defineNuxtRouteMiddleware(async () => {
  const { isAuthenticated, fetchMe } = useAuth()
  const localePath = useLocalePath()

  if (!isAuthenticated.value) await fetchMe()

  if (isAuthenticated.value) {
    return navigateTo(localePath('/app'))
  }
})
