<script setup lang="ts">
/**
 * La navigation publique — arbitrage A1.
 *
 * UNE SEULE ENTRÉE PRINCIPALE : « Concours ». Elle porte la graisse dominante
 * parce que c'est ce que naja7i VEND. « Opportunités » vient au rang
 * secondaire : c'est ce que naja7i AGRÈGE, et l'agrégat nourrit la vente sans
 * la remplacer. Deux entrées de même poids auraient fait deux produits.
 *
 * LA PASTILLE EST LE SEUL ÉLÉMENT MOBILE DE L'EN-TÊTE, et c'est ce qui lui
 * donne sa force : un compteur qui bouge dans un en-tête par ailleurs immobile
 * se remarque sans clignoter. En ajouter un second les annulerait tous les deux.
 *
 * ELLE EST VIVANTE, DONC CALCULÉE. Le nombre vient des annonces réellement
 * ouvertes AUJOURD'HUI — échéance recalculée depuis `deadline`, jamais le champ
 * `jours` figé à la collecte. Un compteur faux sur un en-tête permanent est
 * pire qu'une absence de compteur.
 *
 * Elle DISPARAÎT si la donnée est illisible : « 0 » serait une affirmation
 * fausse, et l'absence ne dit rien. Règle « aucun chiffre fabriqué ».
 */
const props = defineProps<{ ouvertes: number | null }>()

const { t } = useI18n()
const localePath = useLocalePath()

const compteur = computed(() =>
  props.ouvertes !== null && props.ouvertes > 0 ? props.ouvertes : null,
)
</script>

<template>
  <nav class="nav" :aria-label="t('navigation.principale')">
    <!-- `nav__lien--adn` porte la graisse dominante : le poids typographique
         EST la hiérarchie, il ne la commente pas. -->
    <NuxtLink :to="localePath('/concours')" class="nav__lien nav__lien--adn">
      {{ t('catalogue.concours') }}
    </NuxtLink>

    <NuxtLink :to="localePath('/opportunites')" class="nav__lien">
      {{ t('opportunites.titre') }}

      <!-- Le compteur est ANNONCÉ, pas seulement vu : sans `aria-label`, un
           lecteur d'écran lirait « Opportunités 23 » sans dire ce qu'est 23. -->
      <span
        v-if="compteur !== null"
        class="nav__compteur"
        :aria-label="t('opportunites.compteur_aria', { n: compteur })"
      >{{ compteur }}</span>
    </NuxtLink>
  </nav>
</template>
