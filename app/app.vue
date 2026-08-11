<script setup lang="ts">
/**
 * `useThemeApplique` est appelé ICI et nulle part ailleurs : `app.vue` enveloppe
 * tous les gabarits, y compris `error.vue`. Un appel par gabarit produirait deux
 * sources concurrentes sur le même attribut `data-theme`, et la page d'erreur —
 * celle qu'on regarde le moins — serait la seule à repasser en clair.
 */
useThemeApplique()
</script>

<template><NuxtLayout><NuxtPage /></NuxtLayout></template>
