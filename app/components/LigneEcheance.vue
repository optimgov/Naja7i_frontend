<script setup lang="ts">
import type { Annonce } from '~/composables/useOpportunites'

/**
 * Une échéance, EN UNE LIGNE — présentation propre à l'accueil.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI PAS `CarteAnnonce`, QUI EXISTE DÉJÀ
 *
 * C'est un budget de surface, mesuré : six `CarteAnnonce` occupaient 34,4 % de
 * la hauteur de l'accueil à 1440 px et 37,0 % à 390 px, pour un plafond
 * d'arbitrage fixé à 22 %. L'accueil VEND la méthode ; l'agrégat la nourrit, il
 * ne la remplace pas. Un accueil devenu tableau d'affichage aurait gagné en
 * trafic ce qu'il aurait perdu en raison d'être.
 *
 * ÉCRASER LES SIX CARTES POUR LES FAIRE TENIR AURAIT ÉTÉ LA MAUVAISE
 * CORRECTION : des cartes serrées restent des cartes, avec leur jauge, leur
 * pastille de nature et leur ligne de rattachement — on aurait rendu illisible
 * ce qui était seulement trop grand. Une ligne n'est pas une carte comprimée,
 * c'est un autre objet : quatre informations, et la fiche complète à un clic.
 *
 * LES QUATRE INFORMATIONS SONT CELLES QU'UN CANDIDAT VÉRIFIE D'ABORD :
 * l'intitulé, l'administration qui recrute, la clôture, et le chemin vers
 * l'annonce. Le nombre de postes, l'échelle et les régions vivent sur la fiche —
 * ils n'aident pas à décider s'il faut cliquer.
 *
 * LA CLÔTURE PORTE DEUX CANAUX, pas quatre : le libellé écrit et l'icône du
 * palier imminent. La jauge n'a pas de sens sur une ligne de cette hauteur, et
 * la couleur ne porte jamais l'information seule — c'est la règle mesurée du
 * bloc d'échéance, et elle vaut ici aussi.
 */
const props = defineProps<{ annonce: Annonce }>()

const { t, locale } = useI18n()
const localePath = useLocalePath()

const echeance = computed(() => echeanceDe(props.annonce))

/**
 * `-u-nu-latn` FORCE LES CHIFFRES LATINS en arabe : sans cette extension,
 * `ar-MA` rend des chiffres arabo-indiens là où tout le produit affiche des
 * chiffres latins (D-F54). Les noms de mois restent traduits.
 */
const dateEcheance = computed(() => {
  const brut = props.annonce.deadline
  if (!brut) return null

  const date = new Date(brut)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString(locale.value === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA', {
    day: 'numeric',
    month: 'long',
  })
})
</script>

<template>
  <li class="echeance-ligne" :class="`echeance-ligne--${echeance.palier}`">
    <div class="echeance-ligne__corps">
      <!-- Le titre EST le lien : une ligne dont seule la flèche finale est
           cliquable demande de viser, et sur téléphone on rate. -->
      <h3 class="echeance-ligne__titre">
        <NuxtLink
          class="echeance-ligne__lien"
          :to="localePath(`/opportunites/${annonce.slug}`)"
          dir="auto"
        >
          {{ annonce.titre }}
        </NuxtLink>
      </h3>

      <p class="echeance-ligne__org" dir="auto">{{ annonce.org }}</p>
    </div>

    <p class="echeance-ligne__cloture">
      <!-- L'icône REDOUBLE le libellé au seul palier imminent ; `aria-hidden`,
           parce que la phrase qui suit dit déjà l'urgence en toutes lettres. -->
      <span v-if="echeance.icone" aria-hidden="true">⏳</span>
      <span>{{ t(echeance.cle, { n: echeance.jours ?? 0 }) }}</span>
      <time v-if="dateEcheance" :datetime="annonce.deadline ?? undefined">{{ dateEcheance }}</time>
    </p>
  </li>
</template>
