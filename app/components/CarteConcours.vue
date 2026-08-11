<script setup lang="ts">
defineProps<{
  to: string
  titre: string
  texte?: string | null
  disponibilite: 'open' | 'waitlist' | 'closed'
  meta?: string | null
}>()

const { t } = useI18n()
</script>

<template>
  <NuxtLink :to="to" class="carte" :data-etat="disponibilite">
    <span class="carte__puce">
      {{ disponibilite === 'open' ? t('catalogue.ouvert') : t('catalogue.en_preparation') }}
    </span>
    <h3 class="carte__titre">{{ titre }}</h3>
    <p v-if="meta" class="carte__meta">{{ meta }}</p>
    <p v-if="texte" class="carte__texte">{{ texte }}</p>
  </NuxtLink>
</template>

<style scoped>
.carte {
  display: block;
  padding: var(--e-4);
  text-decoration: none;
  background: var(--sable-0);
  border: 1px solid var(--sable-200);
  border-radius: var(--r);
  border-block-start: 3px solid var(--vert-700);
  transition: border-color .15s ease;
}
.carte[data-etat="waitlist"],
.carte[data-etat="closed"] { border-block-start-color: var(--sable-300); }
.carte:hover { border-color: var(--bordure-forte, var(--sable-300)); }

.carte__puce {
  display: inline-block;
  margin-block-end: var(--e-2);
  font-size: var(--t-xs);
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--vert-50);
  color: var(--vert-800);
}
.carte[data-etat="waitlist"] .carte__puce,
.carte[data-etat="closed"] .carte__puce { background: var(--sable-100); color: var(--encre-700); }

.carte__titre { font-size: var(--t-lg); margin-block-end: 6px; }
.carte__meta { font-size: var(--t-xs); color: var(--texte-doux); font-family: var(--mono); margin-block-end: 6px; }
.carte__texte { font-size: var(--t-sm); color: var(--texte-doux); }
</style>
