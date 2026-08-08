<script setup lang="ts">
definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const { requestPasswordReset } = useAuth()
const localePath = useLocalePath()

const email = ref('')
const envoye = ref(false)
const envoi = ref(false)

// L'API répond toujours 202, que le compte existe ou non. L'interface doit
// tenir le même discours : afficher « e-mail inconnu » ici ruinerait la
// protection contre l'énumération de comptes assurée côté serveur.
async function soumettre() {
  envoi.value = true
  try {
    await requestPasswordReset(email.value)
    envoye.value = true
  } catch {
    envoye.value = true
  } finally {
    envoi.value = false
  }
}

useHead({ title: t('oubli.titre') })
</script>

<template>
  <div>
    <h1>{{ t('oubli.titre') }}</h1>

    <template v-if="envoye">
      <div class="alerte alerte--succes" role="status">{{ t('oubli.confirme') }}</div>
      <p class="sous-titre">{{ t('oubli.confirme_aide') }}</p>
      <NuxtLink :to="localePath('/connexion')">{{ t('oubli.retour') }}</NuxtLink>
    </template>

    <template v-else>
      <p class="sous-titre">{{ t('oubli.sous_titre') }}</p>
      <form novalidate @submit.prevent="soumettre">
        <label class="champ">
          <span class="champ__label">{{ t('champs.email') }}</span>
          <input v-model="email" type="email" autocomplete="email" required class="champ__saisie">
        </label>
        <button type="submit" class="bouton" :disabled="envoi">
          {{ envoi ? t('oubli.envoi') : t('oubli.action') }}
        </button>
      </form>
      <p class="liens">
        <NuxtLink :to="localePath('/connexion')">{{ t('oubli.retour') }}</NuxtLink>
      </p>
    </template>
  </div>
</template>

<style scoped>
.sous-titre { margin-block-end: var(--espace-4); color: var(--texte-doux); font-size: var(--taille-s); }
.liens { margin-block-start: var(--espace-3); font-size: var(--taille-s); text-align: center; }
</style>
