<script setup lang="ts">
definePageMeta({ layout: 'public', middleware: 'preparation' })

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const { vers } = useLienEspaceCandidat()
const slug = route.params.filiere as string

const { filiere } = useCatalogue()
const { data: porte, error } = await filiere(slug)

// Une filière non publiée répond 404, jamais 403 : un 403 confirmerait son
// existence et laisserait deviner le catalogue à venir.
if (error.value || !porte.value) {
  throw erreurDeChargement(error.value, t('catalogue.introuvable'))
}

useSeoCatalogue({
  title: porte.value.name,
  description: porte.value.tagline ?? t('catalogue.description_index'),
  path: `/concours/${slug}`,
})
</script>

<template>
  <div v-if="porte" class="enveloppe section">
    <nav class="fil" :aria-label="t('catalogue.fil_ariane')">
      <NuxtLink :to="localePath('/')">{{ t('catalogue.accueil') }}</NuxtLink>
      <span aria-hidden="true">/</span>
      <NuxtLink :to="vers('/concours')">{{ t('catalogue.concours') }}</NuxtLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ porte.name }}</span>
    </nav>

    <h1 class="titre-page">{{ porte.name }}</h1>
    <p v-if="porte.tagline" class="chapeau">{{ porte.tagline }}</p>

    <div class="grille grille--3">
      <CarteConcours
        v-for="famille in porte.families"
        :key="famille.uuid"
        :to="vers(`/concours/famille/${famille.slug}`)"
        :titre="famille.name"
        :texte="famille.description"
        :meta="famille.authority"
        :disponibilite="famille.availability"
      />
    </div>
  </div>
</template>
