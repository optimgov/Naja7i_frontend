<script setup lang="ts">
definePageMeta({ layout: 'public' })

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const famille = route.params.famille as string
const slug = route.params.specialite as string

const { specialite } = useCatalogue()
const { data: matiere, error } = await specialite(famille, slug)

if (error.value || !matiere.value) {
  throw createError({ statusCode: 404, statusMessage: t('catalogue.introuvable'), fatal: true })
}

useSeoCatalogue({
  title: matiere.value.name,
  description: matiere.value.description ?? t('catalogue.description_index'),
  path: `/concours/famille/${famille}/${slug}`,
})

const ouverte = computed(() => matiere.value?.availability === 'open')
</script>

<template>
  <div v-if="matiere" class="enveloppe section">
    <nav class="fil" :aria-label="t('catalogue.fil_ariane')">
      <NuxtLink :to="localePath('/')">{{ t('catalogue.accueil') }}</NuxtLink>
      <span aria-hidden="true">/</span>
      <NuxtLink :to="localePath(`/concours/famille/${famille}`)">
        {{ matiere.family?.name ?? famille }}
      </NuxtLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ matiere.name }}</span>
    </nav>

    <p v-if="matiere.cycle" class="oeil">{{ matiere.cycle }}</p>
    <h1 class="titre-page">{{ matiere.name }}</h1>
    <p v-if="matiere.description" class="chapeau">{{ matiere.description }}</p>

    <!--
      Une spécialité en liste d'attente ne propose jamais de diagnostic :
      critère de recette de NAJA7I-ZP-001 §9.
    -->
    <div v-if="ouverte" class="actes">
      <NuxtLink class="btn btn--grand" :to="localePath('/methode/correction')">
        {{ t('catalogue.voir_correction') }}
      </NuxtLink>
    </div>
    <div v-else class="attente">
      <p>{{ t('catalogue.specialite_en_attente') }}</p>
    </div>
  </div>
</template>

<style scoped>
.actes { margin-block-start: var(--e-5); }
.attente { margin-block-start: var(--e-5); padding: var(--e-4);
  background: var(--sable-50); border: 1px solid var(--sable-200); border-radius: var(--r);
  font-size: var(--t-sm); color: var(--encre-700); max-inline-size: 60ch; }
</style>
