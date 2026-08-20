// `process` vient de Node, pas du navigateur : l'importer explicitement le
// type sans élargir la configuration TypeScript.
import process from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-01',
  devtools: { enabled: true },

  // L'overlay range le code applicatif sous `app/` (app.vue, pages, layouts,
  // composables, middleware) — c'est l'arborescence Nuxt 4. Sur Nuxt 3 elle
  // n'est pas active par défaut : sans ce drapeau, Nuxt cherche `pages/` à la
  // racine, n'en trouve aucune et sert sa page d'accueil de bienvenue.
  // On reste bien sur Nuxt 3 ; seule la convention de dossiers change.
  future: { compatibilityVersion: 4 },

  modules: ['@nuxtjs/i18n'],

  // `~` désigne `app/` sous cette arborescence, or la feuille de style est à la
  // racine comme le documente le README : `~~` (racine du projet) est requis.
  css: ['~~/assets/css/tokens.css', '~~/assets/css/commun.css'],

  runtimeConfig: {
    // Jamais exposé au navigateur : le client ne doit pas connaître l'API.
    apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:8000',

    public: {
      appProtocol: process.env.APP_PROTOCOL || 'http',

      // Origine publique de CET environnement. Elle nourrit les canoniques, les
      // `hreflang`, le sitemap et les liens de partage — tout ce qui nomme le
      // site à l'extérieur de lui-même.
      //
      // La clé doit être DÉCLARÉE ici, même vide : Nitro ne matérialise
      // `NUXT_PUBLIC_SITE_URL` à l'exécution que pour les clés déclarées. Sans
      // cette ligne, poser la variable sur le serveur reste sans effet — le
      // même piège que `API_BASE_URL`, documenté dans le runbook de préprod.
      //
      // Le défaut est la production, parce qu'une origine absente ne doit pas
      // casser le rendu ; c'est aux environnements NON productifs de se
      // nommer, sans quoi la préproduction déclare les URL de la production.
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://www.naja7i.ma',
    },
  },

  i18n: {
    locales: [
      { code: 'fr', language: 'fr-MA', name: 'Français', dir: 'ltr', file: 'fr.json' },
      { code: 'ar', language: 'ar-MA', name: 'العربية', dir: 'rtl', file: 'ar.json' },
    ],
    defaultLocale: 'fr',
    strategy: 'prefix',          // /fr/... et /ar/... — les liens d'e-mail en dépendent
    langDir: 'locales',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'naja7i_locale',
      redirectOn: 'root',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      link: [
        // Une favicon SVG suit la définition de l'écran sans jeu de tailles à
        // maintenir. Le PNG reste pour les contextes qui ignorent le SVG —
        // l'écran d'accueil iOS au premier chef.
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap',
        },
      ],
    },
  },
})
