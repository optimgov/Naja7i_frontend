<script setup lang="ts">
import type { Annonce } from '~/composables/useOpportunites'

/**
 * L'échéance d'une annonce — TROIS CANAUX REDONDANTS, la couleur en quatrième.
 *
 * Règle MESURÉE, pas une préférence : `valider-palette.mjs` du 9 août 2026
 * établit que safran-700 et terre-700 sont à ΔE 4,8 en deutéranopie. Une
 * échelle d'urgence à quatre paliers colorés est donc impossible — les paliers
 * du milieu seraient indistinguables pour une partie des candidats, sur
 * l'information dont dépend leur candidature.
 *
 *   1. LE LIBELLÉ ÉCRIT      « Clôture dans 3 jours » — il se suffit
 *   2. LA LONGUEUR DE JAUGE  fraction d'une fenêtre de 60 jours
 *   3. L'ICÔNE               au seul palier imminent
 *   4. la couleur            binaire, et elle ne fait que redoubler
 *
 * LE TEST À FAIRE PASSER À TOUTE ÉVOLUTION DE CE FICHIER : retirer la couleur
 * ne doit rien retirer au sens.
 *
 * La jauge est `aria-hidden` : elle REDIT ce que le libellé énonce déjà, et un
 * lecteur d'écran qui annoncerait « 12 % » sur une échéance n'ajouterait rien.
 */
const props = defineProps<{ annonce: Annonce }>()

const { t, locale } = useI18n()

const echeance = computed(() => echeanceDe(props.annonce))

/**
 * Date d'échéance en clair, à côté du décompte : « dans 12 jours » se relit
 * mal une semaine plus tard, et une date ne périme pas.
 *
 * `-u-nu-latn` FORCE LES CHIFFRES LATINS en arabe. Sans cette extension,
 * `ar-MA` rend des chiffres arabo-indiens (١٤) là où tout le reste du produit
 * affiche des chiffres latins — D-F54 a tranché ce point pour les nombres, et
 * une date n'a pas de raison d'y échapper. Les noms de mois, eux, restent bien
 * traduits : c'est le système de CHIFFRES qu'on fige, pas la langue.
 */
const dateEcheance = computed(() => {
  const brut = props.annonce.deadline
  if (!brut) return null

  const date = new Date(brut)
  if (Number.isNaN(date.getTime())) return null

  const etiquette = locale.value === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA'

  return date.toLocaleDateString(etiquette, { day: 'numeric', month: 'long', year: 'numeric' })
})
</script>

<template>
  <div class="echeance" :class="`echeance--${echeance.palier}`">
    <p class="echeance__ligne">
      <!-- Canal 3 : l'icône n'apparaît qu'au palier imminent. `aria-hidden`,
           parce que le libellé qui suit dit déjà l'urgence en toutes lettres. -->
      <span v-if="echeance.icone" class="echeance__icone" aria-hidden="true">⏳</span>

      <!-- Canal 1 : le libellé écrit. Il se suffit seul, sans couleur ni jauge. -->
      <span>{{ t(echeance.cle, { n: echeance.jours ?? 0 }) }}</span>
    </p>

    <!-- Canal 2 : la longueur. Redondante par construction, donc masquée aux
         technologies d'assistance. -->
    <span v-if="echeance.palier !== 'close'" class="echeance__piste" aria-hidden="true">
      <span class="echeance__jauge" :style="{ inlineSize: `${echeance.part}%` }" />
    </span>

    <time v-if="dateEcheance" class="echeance__date" :datetime="annonce.deadline ?? undefined">
      {{ t('opportunites.echeance_le', { date: dateEcheance }) }}
    </time>
  </div>
</template>
