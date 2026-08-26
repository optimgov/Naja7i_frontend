/**
 * Conserve le chrome candidat dans les surfaces qui existent aussi en public.
 * Sans ce marqueur, Nuxt recharge leur gabarit public au clic suivant.
 */
export function useLienEspaceCandidat() {
  const route = useRoute()
  const localePath = useLocalePath()
  const dansEspaceCandidat = computed(() => route.query.espace === 'candidat')

  function vers(chemin: string) {
    const path = localePath(chemin)

    return dansEspaceCandidat.value ? `${path}?espace=candidat` : path
  }

  return { dansEspaceCandidat, vers }
}
