<script setup lang="ts">
// Redirection vers la locale par défaut. La vraie page d'accueil publique
// (SEO, portails, catalogue) viendra au lot suivant.
definePageMeta({ layout: false })
const localePath = useLocalePath()
await navigateTo(localePath('/connexion'))
</script>

<template><div /></template>
