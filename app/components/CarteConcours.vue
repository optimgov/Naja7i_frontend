<script setup lang="ts">
import type { Disponibilite } from '~/utils/disponibilite'

const props = defineProps<{
  to: string
  titre: string
  texte?: string | null
  disponibilite: Disponibilite
  meta?: string | null
}>()

const { t } = useI18n()

/**
 * LES TROIS ÉTATS SE DISENT, ET ILS SE DISENT DIFFÉREMMENT.
 *
 * Cette pastille repliait tout ce qui n'était pas `open` sur « En préparation ».
 * Un concours `closed` était donc annoncé comme un concours à venir — la seule
 * chose que le candidat ne devait pas croire. La correspondance est désormais
 * exhaustive et partagée : voir `app/utils/disponibilite.ts`.
 */
const libelleEtat = computed(() => t(CLES_DISPONIBILITE[props.disponibilite]))
</script>

<template>
  <NuxtLink :to="to" class="carte" :data-etat="disponibilite">
    <!--
      `aria-label` plutôt que le seul texte visible : hors contexte, « Ouvert »
      ne dit pas de quoi il est l'état. Annoncé « Statut : Ouvert », le badge se
      comprend seul — ce qui est exactement la situation d'un lecteur d'écran
      qui parcourt les cartes une à une. Le mot visible reste contenu dans le
      libellé, comme l'exige WCAG 2.5.3.
    -->
    <span class="carte__puce" :aria-label="t('catalogue.statut', { etat: libelleEtat })">
      {{ libelleEtat }}
    </span>
    <h3 class="carte__titre" dir="auto">{{ titre }}</h3>
    <p v-if="meta" class="carte__meta" dir="auto">{{ meta }}</p>
    <p v-if="texte" class="carte__texte" dir="auto">{{ texte }}</p>
  </NuxtLink>
</template>

<style scoped>
.carte {
  display: block;
  padding: var(--e-4);
  text-decoration: none;
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  border-block-start: 3px solid var(--vert-700);
  transition: border-color .15s ease;
}
.carte[data-etat="waitlist"],
.carte[data-etat="closed"] { border-block-start-color: var(--bordure-forte); }
.carte:hover { border-color: var(--bordure-forte); }

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
.carte[data-etat="closed"] .carte__puce { background: var(--surface-douce); color: var(--texte-doux); }

.carte__titre { font-size: var(--t-lg); margin-block-end: 6px; }
.carte__meta { font-size: var(--t-xs); color: var(--texte-doux); margin-block-end: 6px; }
.carte__texte { font-size: var(--t-sm); color: var(--texte-doux); }
</style>
