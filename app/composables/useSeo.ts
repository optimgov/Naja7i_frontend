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

/**
 * LES SURFACES QUI NE DOIVENT PAS ÊTRE INDEXÉES — la politique en un endroit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI `noindex, nofollow` ICI, ET `noindex, follow` SUR `/recherche`
 *
 * `/recherche` est une page de résultats internes : elle ne doit pas être
 * indexée, mais les liens qu'elle porte mènent à des pages de catalogue qui,
 * elles, DOIVENT l'être — d'où `follow`.
 *
 * L'authentification et l'espace candidat sont l'exact opposé. Rien derrière un
 * formulaire de connexion n'a vocation à être découvert par un robot : une
 * page de vérification d'e-mail, un tableau de bord, une correction de
 * tentative n'existent que pour la personne connectée. `follow` y enverrait un
 * robot explorer des adresses qui répondront toutes par une redirection vers la
 * connexion — du budget d'exploration dépensé pour fabriquer du bruit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POSÉE AU GABARIT, PAS À LA PAGE
 *
 * Les deux gabarits `auth` et `app` couvrent l'ensemble de ces écrans, et un
 * écran ajouté demain en hérite sans qu'on ait à y penser. Répéter la balise
 * page par page garantit qu'une page l'oubliera — et ce serait précisément la
 * page ajoutée en dernier, celle que personne ne relit.
 *
 * Ce n'est PAS une mesure de sécurité : un robot n'a de toute façon pas de
 * session. C'est une mesure de propreté d'index, et elle vaut pour les moteurs
 * qui respectent la balise, ce qu'ils font tous.
 */
export function useNonIndexable(): void {
  useSeoMeta({ robots: 'noindex,nofollow' })
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
