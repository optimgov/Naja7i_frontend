<script setup lang="ts">
/**
 * La navigation publique de bureau — QUATRE ENTRÉES PUBLIÉES.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ORDRE EST LE PARCOURS, PAS UN CLASSEMENT
 *
 *   1. Concours       ce que naja7i VEND — et la porte du référentiel
 *   2. Opportunités   ce que naja7i AGRÈGE, et l'agrégat nourrit la vente
 *   3. Se préparer    le CŒUR du produit, d'où l'accent typographique
 *   4. Tarifs         la surface commerciale, publique et indexable
 *
 * « Se préparer » porte l'accent parce que c'est la seule entrée qui mène à ce
 * qui distingue ce produit : une correction qui explique. Elle vient en
 * troisième et non en première parce qu'un visiteur arrive en cherchant un
 * concours, pas une méthode — on le prend là où il est, puis on l'y conduit.
 *
 * IL N'Y A PAS DE CINQUIÈME ENTRÉE. « Annales » est une future porte
 * principale ; tant qu'aucune collection n'est publiée et juridiquement
 * diffusable, l'emplacement reste vide plutôt qu'occupé par un lien qui ne mène
 * nulle part. Un menu de premier niveau qui rend 404 coûte plus qu'une place
 * inoccupée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA PASTILLE EST LE SEUL ÉLÉMENT MOBILE DE L'EN-TÊTE
 *
 * C'est ce qui lui donne sa force : un compteur qui bouge dans un en-tête par
 * ailleurs immobile se remarque sans clignoter. En ajouter un second les
 * annulerait tous les deux.
 *
 * ELLE EST VIVANTE, DONC CALCULÉE — depuis les annonces réellement ouvertes
 * AUJOURD'HUI, échéance recalculée depuis `deadline`, jamais le champ `jours`
 * figé à la collecte. Elle DISPARAÎT si la donnée est illisible, et elle
 * disparaît aussi si elle vaut zéro : « 0 » sur une surface publique est une
 * affirmation, et une affirmation décourageante ; l'absence, elle, ne dit rien.
 */
const props = defineProps<{ ouvertes: number | null }>()

const { t } = useI18n()
const localePath = useLocalePath()

const compteur = computed(() =>
  props.ouvertes !== null && props.ouvertes > 0 ? props.ouvertes : null,
)

/*
 * LE MÉGA-MENU. `declencheur` et `panneau` sont des références de gabarit : le
 * composable en a besoin pour rendre le focus et pour décider si un clic est
 * « dehors ». Le panneau n'existe qu'ouvert (`v-if`) — masqué en CSS, il
 * resterait dans l'arbre d'accessibilité et la tabulation le traverserait.
 */
const declencheur = ref<HTMLElement | null>(null)
const panneau = ref<HTMLElement | null>(null)
const { ouvert, basculer } = usePanneau('mega-concours', { declencheur, panneau })

const { filieres } = useCatalogue()
const { data: catalogue, error: erreurCatalogue } = await filieres()

const listeFilieres = computed(() =>
  erreurCatalogue.value || !catalogue.value ? [] : catalogue.value,
)
const catalogueIllisible = computed(() => Boolean(erreurCatalogue.value) || !catalogue.value)
</script>

<template>
  <nav class="nav" :aria-label="t('navigation.principale')">
    <!-- ═══ 1. Concours — un BOUTON, parce qu'il ouvre un panneau ═══
         Un `<a>` qui n'irait nulle part mentirait sur son rôle : le clavier
         attend Entrée d'un lien et Entrée OU Espace d'un bouton, et un lecteur
         d'écran annonce « lien » là où il faudrait « bouton, réduit ».
         Le lien vers `/concours` reste offert, dans le panneau. -->
    <button
      ref="declencheur"
      type="button"
      class="nav__lien nav__lien--adn nav__declencheur"
      :aria-expanded="ouvert"
      aria-controls="mega-concours"
      @click="basculer"
    >
      {{ t('catalogue.concours') }}
      <span class="nav__chevron" :class="{ 'nav__chevron--ouvert': ouvert }" aria-hidden="true">▾</span>
    </button>

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

    <NuxtLink :to="localePath('/se-preparer')" class="nav__lien nav__lien--coeur">
      {{ t('navigation.se_preparer') }}
    </NuxtLink>

    <NuxtLink :to="localePath('/tarifs')" class="nav__lien">
      {{ t('pied.tarifs') }}
    </NuxtLink>
  </nav>

  <!-- Le panneau est SŒUR de la nav, pas son enfant : posé dans un `<nav>` en
       `overflow-x: auto`, il serait rogné par le rail défilant. Il reste
       immédiatement après elle dans le DOM, donc la tabulation y entre
       naturellement après la dernière entrée du menu. -->
  <div
    v-if="ouvert"
    id="mega-concours"
    ref="panneau"
    class="mega-enveloppe"
  >
    <MegaConcours :filieres="listeFilieres" :illisible="catalogueIllisible" />
  </div>
</template>
