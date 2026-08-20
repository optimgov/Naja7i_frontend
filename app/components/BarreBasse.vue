<script setup lang="ts">
/**
 * La barre basse — navigation de téléphone, CINQ entrées.
 *
 * POURQUOI ELLE REMPLACE LA NAV DU HAUT SOUS 62 rem, et ce n'est pas une
 * habitude d'application mobile : un rail horizontal défilant en haut d'écran
 * reste hors du champ visible ET hors du pouce. La barre basse est atteignable.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CINQ ENTRÉES, ET LA CINQUIÈME A ÉTÉ MESURÉE AVANT D'ÊTRE POSÉE
 *
 * Ce composant en documentait QUATRE, avec un motif : « une cinquième aurait
 * ramené chaque cible sous le seuil tactile de 44 px à 320 px de large ».
 * L'arithmétique disait autre chose — 320 / 5 = 64 px, et la hauteur vaut
 * 56 px : le seuil de WCAG 2.2 est tenu deux fois. Le risque réel n'était pas la
 * CIBLE mais le LIBELLÉ : « Opportunités » est un mot de douze caractères sans
 * espace, et il ne se coupe pas tout seul.
 *
 * Il est donc traité comme tel : le libellé se replie sur deux lignes, et sous
 * 22,5 rem la taille descend d'un cran. `scripts/recette-zone-publique.mjs`
 * mesure les cinq cibles ET le débordement de leurs libellés à 320 et 390 px,
 * en français et en arabe — le contrôle vaut mieux que le raisonnement qui
 * l'avait remplacé.
 *
 * L'ORDRE SUIT LE PARCOURS : d'où l'on part, ce qu'on cherche, ce qu'on
 * travaille, ce qui presse, et soi. « Se préparer » est au centre, à l'endroit
 * le plus atteignable au pouce — c'est le geste que ce produit existe pour
 * provoquer.
 *
 * `aria-current="page"` porte l'état actif — la couleur seule ne le dirait pas
 * à un lecteur d'écran, et c'est la même règle que partout ailleurs ici.
 */
const props = defineProps<{ ouvertes: number | null }>()

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { isAuthenticated } = useAuth()

const compteur = computed(() =>
  props.ouvertes !== null && props.ouvertes > 0 ? props.ouvertes : null,
)

/**
 * L'entrée active se déduit du chemin SANS son préfixe de langue : `/fr/app`
 * et `/ar/app` sont la même destination, et comparer les chemins entiers
 * casserait l'état actif dès la bascule de langue.
 */
const chemin = computed(() => route.path.replace(/^\/(fr|ar)(?=\/|$)/, '') || '/')

/*
 * « Compte » mène à l'espace du candidat s'il en a un, à la connexion sinon.
 * Un lien de compte qui rebondit systématiquement sur un formulaire de
 * connexion pour quelqu'un de déjà connecté est le genre de détour qui fait
 * douter du reste.
 */
const versCompte = computed(() => localePath(isAuthenticated.value ? '/app' : '/connexion'))

const entrees = computed(() => [
  { cle: 'accueil', to: localePath('/'), actif: chemin.value === '/', icone: '⌂' },
  { cle: 'concours', to: localePath('/concours'), actif: chemin.value.startsWith('/concours'), icone: '◎' },
  { cle: 'preparer', to: localePath('/se-preparer'), actif: chemin.value.startsWith('/se-preparer'), icone: '◆' },
  { cle: 'opportunites', to: localePath('/opportunites'), actif: chemin.value.startsWith('/opportunites'), icone: '◈', pastille: true },
  { cle: 'compte', to: versCompte.value, actif: chemin.value.startsWith('/connexion') || chemin.value.startsWith('/app'), icone: '☺' },
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
      <span class="barre-basse__mot">{{ t(`navigation.barre_${entree.cle}`) }}</span>
    </NuxtLink>
  </nav>
</template>
