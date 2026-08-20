/**
 * Métadonnées de référencement, avec `hreflang` réciproque.
 *
 * Les pages de catalogue sont le levier d'acquisition du plan à 90 jours :
 * sans titre propre, sans description et sans alternance de langue déclarée,
 * elles ne se positionnent pas (NAJA7I-ZP-001 §9).
 */
/**
 * L'ORIGINE PUBLIQUE DE CET ENVIRONNEMENT — une seule lecture, un seul repli.
 *
 * Tout ce qui NOMME le site à l'extérieur de lui-même en dépend : canoniques,
 * `hreflang`, et désormais les liens de partage. Le repli en dur pointe sur la
 * production, parce qu'une origine absente ne doit pas casser le rendu — c'est
 * aux environnements non productifs de se nommer (`NUXT_PUBLIC_SITE_URL`).
 *
 * Extrait pour que le partage WhatsApp ne se fabrique pas sa propre base : deux
 * lectures auraient divergé, et la fiche aurait annoncé une origine dans sa
 * balise canonique et une autre dans le message envoyé à un contact.
 */
export function useOrigine(): string {
  const config = useRuntimeConfig()
  return config.public.siteUrl || 'https://www.naja7i.ma'
}

/**
 * L'URL canonique d'un chemin, dans une langue donnée. C'est elle qu'on
 * partage : jamais `window.location`, qui porterait les paramètres de suivi de
 * la visite en cours et l'origine du poste de recette.
 */
export function urlCanonique(langue: string, chemin: string): string {
  return `${useOrigine()}/${langue}${chemin}`
}

export function useSeoCatalogue(options: {
  title: string
  description: string
  path: string
}) {
  const { locale, locales } = useI18n()
  const base = useOrigine()

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
