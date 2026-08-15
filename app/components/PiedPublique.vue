<script setup lang="ts">
/**
 * Le pied de la zone publique — trois colonnes, et la mention qui compte.
 *
 * FORME DE LA MAQUETTE, LIENS DU DÉPÔT. La source liste « Annales », « Tarifs »,
 * « Alerte par filière », « Vérifier une attestation » : aucune de ces routes
 * n'existe. Les poser ferait exactement ce que le FRONT-1 avait dû corriger sur
 * l'accueil — un bouton principal qui menait à un 404. On garde la structure et
 * on n'y met que ce qui répond.
 *
 * LES FILIÈRES VIENNENT DU CATALOGUE, pas d'une liste écrite ici : une liste en
 * dur vieillit en silence le jour où une filière ouvre ou ferme.
 *
 * LA MENTION EST LA PIÈCE IMPORTANTE DE CE PIED, et elle n'est pas décorative :
 * naja7i AGRÈGE des avis publics, et seul l'avis officiel fait foi. Un
 * agrégateur qui ne le dit pas laisse croire qu'il est la source.
 */
const { t } = useI18n()
const localePath = useLocalePath()

const { filieres } = useCatalogue()
const { data: portes, error: erreurPortes } = await filieres()

/* Illisible → la colonne disparaît. On n'invente pas une liste de filières. */
const preparations = computed(() =>
  erreurPortes.value || !portes.value ? [] : portes.value,
)

const annee = new Date().getFullYear()
</script>

<template>
  <footer class="pied">
    <div class="enveloppe">
      <div class="pied__grille">
        <div v-if="preparations.length">
          <p class="pied__titre">{{ t('pied.preparation') }}</p>
          <ul class="pied__liste">
            <li v-for="porte in preparations" :key="porte.uuid">
              <NuxtLink :to="localePath(`/concours/${porte.slug}`)" dir="auto">
                {{ porte.name }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <div>
          <p class="pied__titre">{{ t('opportunites.titre') }}</p>
          <ul class="pied__liste">
            <li>
              <NuxtLink :to="localePath('/opportunites')">{{ t('pied.toutes_annonces') }}</NuxtLink>
            </li>
            <!-- Les filtres vivent dans l'URL : ces liens sont donc de vraies
                 destinations, pas des raccourcis d'interface. -->
            <li>
              <NuxtLink :to="localePath('/opportunites?sous=7j')">{{ t('pied.echeances_proches') }}</NuxtLink>
            </li>
            <li>
              <NuxtLink :to="localePath('/opportunites?type=poste_responsabilite')">
                {{ t('opportunites.type_poste_responsabilite') }}
              </NuxtLink>
            </li>
          </ul>
        </div>

        <div>
          <p class="pied__titre">{{ t('pied.plateforme') }}</p>
          <ul class="pied__liste">
            <li><NuxtLink :to="localePath('/concours')">{{ t('catalogue.concours') }}</NuxtLink></li>
            <li><NuxtLink :to="localePath('/tarifs')">{{ t('pied.tarifs') }}</NuxtLink></li>
            <li><NuxtLink :to="localePath('/connexion')">{{ t('navigation.connexion') }}</NuxtLink></li>
            <li><NuxtLink :to="localePath('/inscription')">{{ t('inscription.titre') }}</NuxtLink></li>
            <!-- La page du robot est liée depuis le pied : c'est de là qu'un
                 administrateur système la trouvera s'il ne cherche pas notre
                 User-Agent. Prérequis D-O7 du collecteur. -->
            <li><NuxtLink :to="localePath('/robot')">{{ t('pied.robot') }}</NuxtLink></li>
          </ul>
        </div>
      </div>

      <!-- SEUL L'AVIS OFFICIEL FAIT FOI. Un agrégateur qui ne le dit pas laisse
           croire qu'il est la source, et c'est la faute la plus coûteuse qu'une
           zone publique d'agrégation puisse commettre. -->
      <p class="pied__mention">{{ t('pied.mention_agregation') }}</p>
      <p class="pied__mention">{{ t('navigation.mentions', { annee }) }}</p>
    </div>
  </footer>
</template>
