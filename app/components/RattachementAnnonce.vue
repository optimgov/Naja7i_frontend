<script setup lang="ts">
import type { Annonce } from '~/composables/useOpportunites'

/**
 * Le rattachement d'une annonce à une préparation naja7i — TROIS ÉTATS.
 *
 * ON NE PROMET UNE PRÉPARATION QUE SI ELLE EXISTE. C'est la règle, et les
 * trois états sont là pour qu'elle soit tenable :
 *
 *   `prepare`  naja7i prépare ce concours. Seul état qui autorise un LIEN.
 *   `rattache` la filière est identifiée, rien n'est encore préparé. On le
 *              DIT. Taire la différence ferait passer une intention pour une
 *              offre — et c'est exactement ce qu'un candidat ne pardonne pas.
 *   `aucun`    le collecteur n'a pas su rattacher. L'annonce reste servie et
 *              ce composant ne rend RIEN : une mention « non rattaché » serait
 *              du bruit sur une information qui n'intéresse que nous.
 *
 * Les deux derniers ne sont pas un échec à dissimuler. Ce produit agrège plus
 * large qu'il ne prépare, et le dire est ce qui le rend crédible sur ce qu'il
 * prépare vraiment.
 *
 * PAS DE LIEN MASQUÉ NI DE BOUTON DÉSACTIVÉ : soit l'action est proposée, soit
 * elle n'existe pas dans le rendu. Règle du dépôt sur le mur payant, qui vaut
 * ici pour la même raison — un lien grisé invite à cliquer sur du vide.
 */
const props = defineProps<{ annonce: Annonce }>()

const { t } = useI18n()
const localePath = useLocalePath()

const etat = computed(() => rattachementDe(props.annonce))

const versPreparation = computed(() =>
  props.annonce.naja7i.prep_slug
    ? localePath(`/concours/famille/${props.annonce.naja7i.prep_slug}`)
    : null,
)
</script>

<template>
  <!-- `prepare` : une préparation existe, on la propose. -->
  <NuxtLink
    v-if="etat === 'prepare' && versPreparation"
    class="rattachement"
    :to="versPreparation"
  >
    <span class="rattachement__icone" aria-hidden="true">✓</span>
    <span>{{ t('opportunites.rattachement_prepare') }}</span>
  </NuxtLink>

  <!-- `rattache` : la filière est connue, la préparation n'existe pas encore.
       Aucun lien — il n'y a rien au bout. Le texte le dit sans détour. -->
  <p v-else-if="etat === 'rattache'" class="rattachement rattachement--attente">
    <span class="rattachement__icone" aria-hidden="true">◔</span>
    <span>{{ t('opportunites.rattachement_attente') }}</span>
  </p>

  <!-- `aucun` : rien n'est rendu. Voir l'en-tête. -->
</template>
