<script setup lang="ts">
import type { Annonce } from '~/composables/useOpportunites'

/**
 * Le bandeau d'échéance de l'accueil — UNE LIGNE, et c'est tout ce qu'il a.
 *
 * Arbitrage A2 : les annonces tiennent sur l'accueil un bandeau d'une ligne et
 * une section basse. Moins de 22 % de la surface. Ce composant est la moitié
 * haute de ce budget, et une ligne est une contrainte, pas une indication —
 * l'accueil VEND la méthode, il ne devient pas un agrégateur.
 *
 * Il ne s'affiche que s'il a quelque chose d'URGENT à dire. Un bandeau
 * permanent qui annonce « 23 concours ouverts » devient du mobilier : on cesse
 * de le voir, et le jour où il compte vraiment, il ne réveille personne.
 */
const props = defineProps<{ annonces: Annonce[] }>()

const { t } = useI18n()
const localePath = useLocalePath()

/** Les ouvertes, au sens de l'échéance recalculée — jamais du champ figé. */
const ouvertes = computed(() => props.annonces.filter(a => estOuverte(a)))

/** Les imminentes : sept jours ou moins. C'est elles qui justifient le bandeau. */
const imminentes = computed(() =>
  ouvertes.value.filter(a => echeanceDe(a).palier === 'imminente'),
)

/** Somme des postes ouverts. Une annonce sans nombre de postes n'en invente pas. */
const postes = computed(() =>
  ouvertes.value.reduce((total, a) => total + (a.postes ?? 0), 0),
)

/**
 * LE NOMBRE PASSE PAR `nombre()`, ET CE N'EST PAS DE LA TYPOGRAPHIE.
 *
 * Il était interpolé brut : « 12646 postes ouverts au Maroc ». La règle du
 * dépôt veut l'espace fine insécable sur tout nombre d'interface, et sa raison
 * est mesurée — une espace ORDINAIRE laisse l'algorithme bidirectionnel
 * réordonner les groupes de chiffres, si bien que « 12 646 » se lit
 * « 646 12 » en arabe. La fine insécable (U+202F) les soude.
 *
 * Sans espace du tout, l'arabe restait juste et le français restait fautif ; la
 * sonde bidi d'`auditer.mjs`, qui cherche « chiffre + espace + trois chiffres »,
 * ne pouvait rien voir. C'est une capture qui l'a montré.
 */
const postesEnClair = computed(() => nombre(postes.value))

/* Le bandeau se tait quand rien ne presse. Voir l'en-tête. */
const visible = computed(() => imminentes.value.length > 0)
</script>

<template>
  <aside v-if="visible" class="bandeau-echeance" :aria-label="t('opportunites.bandeau_titre')">
    <div class="enveloppe bandeau-echeance__rang">
      <!-- L'urgence est portée par les MOTS. L'icône redouble, elle ne dit rien
           seule — même règle que la jauge du bloc d'échéance. -->
      <span aria-hidden="true">⏳</span>

      <p>
        <strong>{{ t('opportunites.bandeau_imminentes', { n: imminentes.length }) }}</strong>
        <span v-if="postes > 0">{{ t('opportunites.bandeau_postes', { n: postesEnClair }) }}</span>
      </p>

      <NuxtLink class="bandeau-echeance__lien" :to="localePath('/opportunites?sous=7j')">
        {{ t('opportunites.bandeau_voir') }}
        <span class="fleche" aria-hidden="true">→</span>
      </NuxtLink>
    </div>
  </aside>
</template>
