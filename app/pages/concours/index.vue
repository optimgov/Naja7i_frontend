<script setup lang="ts">
definePageMeta({ layout: 'public' })

const { t } = useI18n()
const localePath = useLocalePath()
const { filieres } = useCatalogue()
const { data: portes } = await filieres()

useSeoCatalogue({
  title: t('catalogue.titre_index'),
  description: t('catalogue.description_index'),
  path: '/concours',
})
</script>

<template>
  <div class="enveloppe section">
    <nav class="fil" :aria-label="t('catalogue.fil_ariane')">
      <NuxtLink :to="localePath('/')">{{ t('catalogue.accueil') }}</NuxtLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ t('catalogue.concours') }}</span>
    </nav>

    <h1 class="titre-page">{{ t('catalogue.titre_index') }}</h1>
    <p class="chapeau">{{ t('catalogue.description_index') }}</p>

    <div class="grille grille--3">
      <CarteConcours
        v-for="porte in portes"
        :key="porte.uuid"
        :to="localePath(`/concours/${porte.slug}`)"
        :titre="porte.name"
        :texte="porte.tagline"
        :disponibilite="porte.availability"
        :meta="t('catalogue.n_familles', { n: porte.families?.length ?? 0 })"
      />
    </div>
  </div>
</template>
