<script setup lang="ts">
/**
 * `/confidentialite` — la politique de confidentialité, en version PROVISOIRE.
 *
 * Même raison d'être que `/conditions`, et même refus : la case « J'ai pris
 * connaissance de la politique de confidentialité » pointait vers une 404, et
 * inventer une politique plausible aurait fait consentir un testeur à un
 * document qui n'existe pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUI DISTINGUE CETTE PAGE DE `/conditions`
 *
 * Les conditions n'ont RIEN à dire tant qu'elles ne sont pas rédigées : le
 * droit qu'elles porteront n'existe pas encore. La confidentialité, elle, a
 * déjà un objet — le service traite des données AUJOURD'HUI, que la politique
 * soit publiée ou non.
 *
 * La section « ce que le service traite réellement » n'est donc pas une
 * promesse : chaque ligne est vérifiable dans le code et la configuration.
 * L'adresse et sa vérification (`EMAIL_VERIFICATION_GATE=registration`), les
 * cinq premiers caractères d'empreinte envoyés à la vérification de fuites
 * (`PASSWORD_CHECK_COMPROMISED`), la progression, la langue et le thème, les
 * commandes par coupon. Quatorze jours de rétention des sauvegardes : c'est le
 * minuteur de `naja7i-sauvegarde` sur le serveur.
 *
 * Dire vrai sur un périmètre étroit vaut mieux que promettre large sur un
 * document non validé — et c'est ce qui rendra la politique définitive facile
 * à écrire : elle n'aura pas à démentir cette page.
 *
 * La loi 09-08 est citée parce que c'est le texte marocain applicable, pas
 * parce que cette page s'y conforme. DET-07 tranchera.
 */
definePageMeta({ layout: 'public' })

const { t } = useI18n()

useSeoCatalogue({
  title: t('confidentialite.seo_titre'),
  description: t('confidentialite.seo_description'),
  path: '/confidentialite',
})

/* `noindex` : voir `/conditions`. Un document provisoire indexé serait cité
 * comme s'il faisait foi. `follow` reste, pour le pied de page. */
useHead({
  meta: [{ name: 'robots', content: 'noindex,follow' }],
})

const traite = ['1', '2', '3', '4', '5'] as const
</script>

<template>
  <div class="enveloppe document-legal">
    <p class="oeil">{{ t('confidentialite.oeil') }}</p>
    <h1 class="titre-page">{{ t('confidentialite.titre') }}</h1>

    <section class="document-legal__avertissement" role="note">
      <h2 class="document-legal__avertissement-titre">
        {{ t('confidentialite.avertissement_titre') }}
      </h2>
      <p>{{ t('confidentialite.avertissement_texte') }}</p>
    </section>

    <section class="document-legal__bloc">
      <h2>{{ t('confidentialite.traite_titre') }}</h2>
      <p>{{ t('confidentialite.traite_chapeau') }}</p>
      <ul class="document-legal__liste">
        <li v-for="n in traite" :key="n">{{ t(`confidentialite.traite_${n}`) }}</li>
      </ul>
    </section>

    <section class="document-legal__bloc">
      <h2>{{ t('confidentialite.jamais_titre') }}</h2>
      <p>{{ t('confidentialite.jamais_texte') }}</p>
    </section>

    <section class="document-legal__bloc">
      <h2>{{ t('confidentialite.recette_titre') }}</h2>
      <p>{{ t('confidentialite.recette_texte') }}</p>
    </section>

    <section class="document-legal__bloc">
      <h2>{{ t('confidentialite.couvrira_titre') }}</h2>
      <p>{{ t('confidentialite.couvrira_texte') }}</p>
    </section>

    <p class="document-legal__version">{{ t('confidentialite.version') }}</p>
  </div>
</template>
