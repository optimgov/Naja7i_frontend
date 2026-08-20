<script setup lang="ts">
/**
 * `useThemeApplique` est appelé ici pour TOUS LES GABARITS — et une seconde
 * fois, exactement une, dans `error.vue`.
 *
 * CE COMMENTAIRE DISAIT LE CONTRAIRE, ET IL SE TROMPAIT. Il affirmait que
 * `app.vue` enveloppe `error.vue`. C'est faux : la racine de Nuxt monte
 * `<ErrorComponent v-else-if="error">` — le composant d'erreur REMPLACE
 * l'application, il ne s'y imbrique pas. `app.vue` n'était donc pas monté sur la
 * page d'erreur, et l'attribut `data-theme` n'y était jamais posé : un candidat
 * en thème sombre qui tombait sur un 404 recevait une page blanche en pleine
 * face, de nuit comme de jour.
 *
 * Les deux appels ne se concurrencent pas, parce que les deux composants sont
 * mutuellement exclusifs — jamais montés en même temps. Un appel par GABARIT,
 * lui, resterait une mauvaise idée : les gabarits, eux, coexistent avec
 * `app.vue`.
 */
useThemeApplique()
</script>

<template><NuxtLayout><NuxtPage /></NuxtLayout></template>
