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
