<script setup lang="ts">
/**
 * La barre basse — navigation de téléphone, quatre entrées.
 *
 * POURQUOI ELLE REMPLACE LA NAV DU HAUT SOUS 62 rem, et ce n'est pas une
 * habitude d'application mobile : un rail horizontal défilant en haut d'écran
 * reste hors du champ visible ET hors du pouce. La barre basse est
 * atteignable, et elle donne à « Concours » la première position — qui est
 * aussi la hiérarchie du produit (A1).
 *
 * QUATRE ENTRÉES : Accueil, Concours, Opportunités (pastille), Compte. Une
 * cinquième aurait ramené chaque cible sous le seuil tactile de 44 px à 320 px
 * de large.
 *
 * `aria-current="page"` porte l'état actif — la couleur seule ne le dirait pas
 * à un lecteur d'écran, et c'est la même règle que partout ailleurs ici.
 */
const props = defineProps<{ ouvertes: number | null }>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const compteur = computed(() =>
  props.ouvertes !== null && props.ouvertes > 0 ? props.ouvertes : null,
)

/**
 * L'entrée active se déduit du chemin SANS son préfixe de langue : `/fr/app`
 * et `/ar/app` sont la même destination, et comparer les chemins entiers
 * casserait l'état actif dès la bascule de langue.
 */
const chemin = computed(() => route.path.replace(/^\/(fr|ar)(?=\/|$)/, '') || '/')

const entrees = computed(() => [
  { cle: 'accueil', to: localePath('/'), actif: chemin.value === '/', icone: '⌂' },
  { cle: 'concours', to: localePath('/concours'), actif: chemin.value.startsWith('/concours'), icone: '◎' },
  { cle: 'opportunites', to: localePath('/opportunites'), actif: chemin.value.startsWith('/opportunites'), icone: '◈', pastille: true },
  { cle: 'compte', to: localePath('/connexion'), actif: chemin.value.startsWith('/connexion') || chemin.value.startsWith('/app'), icone: '☺' },
])
</script>

<template>
  <nav class="barre-basse" :aria-label="t('navigation.principale')">
    <NuxtLink
      v-for="entree in entrees"
      :key="entree.cle"
      :to="entree.to"
      class="barre-basse__lien"
      :aria-current="entree.actif ? 'page' : undefined"
    >
      <span class="barre-basse__pile">
        <span class="barre-basse__icone" aria-hidden="true">{{ entree.icone }}</span>

        <span
          v-if="entree.pastille && compteur !== null"
          class="barre-basse__pastille"
          :aria-label="t('opportunites.compteur_aria', { n: compteur })"
        >{{ compteur }}</span>
      </span>

      <!-- Le libellé est TOUJOURS écrit sous l'icône : un pictogramme seul se
           devine, il ne se lit pas — et « ◈ » ne veut rien dire pour personne. -->
      <span>{{ t(`navigation.barre_${entree.cle}`) }}</span>
    </NuxtLink>
  </nav>
</template>
