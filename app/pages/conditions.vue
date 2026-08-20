<script setup lang="ts">
/**
 * `/conditions` — les conditions générales, en version PROVISOIRE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE PAGE EXISTE MAINTENANT, ET POURQUOI ELLE NE DIT PAS DE DROIT
 *
 * Le formulaire d'inscription porte une case « J'accepte les conditions
 * générales d'utilisation » dont le lien répondait 404 — le SEUL endroit du
 * produit où un lien affiché ne répondait pas. La recette humaine bute dessus
 * à chaque création de compte.
 *
 * La tentation était d'écrire des conditions plausibles. C'est précisément ce
 * qu'il ne faut pas faire : sur une case à cocher, un texte qui RESSEMBLE à des
 * conditions est pire qu'une 404, parce qu'un testeur consentirait à un
 * document inventé. Une 404 ne trompe personne ; de fausses CGU, si.
 *
 * Cette page règle donc le lien mort SANS fabriquer de droit. Elle répond 200,
 * annonce son statut avant toute autre chose, et n'énonce que des FAITS
 * vérifiables du produit. DET-07 bloque la publication d'un document légal
 * avant validation juridique marocaine FR/AR : cette page ne la contourne pas,
 * elle attend en le disant.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `noindex` — ET C'EST L'INVERSE DE `/robot`
 *
 * Un document provisoire indexé serait cité comme s'il faisait foi, et
 * survivrait dans les caches longtemps après sa remplaçante. `follow` reste :
 * les liens du pied de page doivent continuer à mener quelque part.
 *
 * Le jour où les conditions définitives sont validées, c'est ce `noindex` qui
 * tombe en premier — il est le marqueur technique du caractère provisoire.
 */
definePageMeta({ layout: 'public' })

const { t } = useI18n()

useSeoCatalogue({
  title: t('conditions.seo_titre'),
  description: t('conditions.seo_description'),
  path: '/conditions',
})

useHead({
  meta: [{ name: 'robots', content: 'noindex,follow' }],
})

/* Les six points de la couverture future. Numérotés en i18n plutôt qu'en
 * tableau littéral : leur ORDRE est éditorial, et la parité fr/ar est
 * contrôlée en CI clé par clé. */
const couvrira = ['1', '2', '3', '4', '5', '6'] as const
</script>

<template>
  <div class="enveloppe document-legal">
    <p class="oeil">{{ t('conditions.oeil') }}</p>
    <h1 class="titre-page">{{ t('conditions.titre') }}</h1>

    <!-- L'avertissement vient AVANT le contenu, jamais après : un lecteur qui
         s'arrête à la première section doit déjà savoir que rien ici ne fait
         foi. `role="note"` plutôt qu'`alert` — ce n'est pas une urgence, c'est
         un statut, et `alert` interromprait un lecteur d'écran sans raison. -->
    <section class="document-legal__avertissement" role="note">
      <h2 class="document-legal__avertissement-titre">
        {{ t('conditions.avertissement_titre') }}
      </h2>
      <p>{{ t('conditions.avertissement_texte') }}</p>
    </section>

    <section class="document-legal__bloc">
      <h2>{{ t('conditions.recette_titre') }}</h2>
      <p>{{ t('conditions.recette_texte') }}</p>
    </section>

    <section class="document-legal__bloc">
      <h2>{{ t('conditions.couvrira_titre') }}</h2>
      <ul class="document-legal__liste">
        <li v-for="n in couvrira" :key="n">{{ t(`conditions.couvrira_${n}`) }}</li>
      </ul>
    </section>

    <section class="document-legal__bloc">
      <h2>{{ t('conditions.vrai_titre') }}</h2>
      <p>{{ t('conditions.vrai_texte') }}</p>
    </section>

    <p class="document-legal__version">{{ t('conditions.version') }}</p>
  </div>
</template>
