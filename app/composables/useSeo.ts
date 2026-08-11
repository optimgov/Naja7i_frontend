/**
 * Métadonnées de référencement, avec `hreflang` réciproque.
 *
 * Les pages de catalogue sont le levier d'acquisition du plan à 90 jours :
 * sans titre propre, sans description et sans alternance de langue déclarée,
 * elles ne se positionnent pas (NAJA7I-ZP-001 §9).
 */
export function useSeoCatalogue(options: {
  title: string
  description: string
  path: string
}) {
  const { locale, locales } = useI18n()
  const config = useRuntimeConfig()
  const base = config.public.siteUrl || 'https://www.naja7i.ma'

  useSeoMeta({
    title: () => `${options.title} — Naja7i.ma`,
    description: () => options.description,
    ogTitle: () => options.title,
    ogDescription: () => options.description,
    ogType: 'website',
    ogLocale: () => (locale.value === 'ar' ? 'ar_MA' : 'fr_MA'),
  })

  const alternates = (locales.value as Array<{ code: string }>).map((l) => ({
    rel: 'alternate',
    hreflang: l.code === 'ar' ? 'ar-MA' : 'fr-MA',
    href: `${base}/${l.code}${options.path}`,
  }))

  useHead({
    link: [
      { rel: 'canonical', href: `${base}/${locale.value}${options.path}` },
      ...alternates,
      { rel: 'alternate', hreflang: 'x-default', href: `${base}/fr${options.path}` },
    ],
  })
}
