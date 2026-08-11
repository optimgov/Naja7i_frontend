/**
 * Attributs de langue et de direction.
 *
 * REVUE FRONT-1 — `useHead({ htmlAttrs: computed(...) })` produisait une
 * erreur de typage : `htmlAttrs` attend un objet dont les valeurs peuvent être
 * réactives, pas un `ComputedRef` enveloppant l'objet entier.
 *
 * `npm run typecheck` était rouge, et aucune CI ne le signalait.
 */
export function useLangueEtDirection() {
  const { locale } = useI18n()

  useHead({
    htmlAttrs: {
      lang: () => locale.value,
      dir: () => (locale.value === 'ar' ? 'rtl' : 'ltr'),
    },
  })
}
