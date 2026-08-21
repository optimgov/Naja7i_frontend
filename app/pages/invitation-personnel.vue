<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

definePageMeta({ layout: 'auth' })
const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { accepterInvitation } = useMonDossier()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const form = reactive({ password: '', password_confirmation: '' })
const erreurs = ref<Record<string, string>>({})
const erreur = ref('')
const envoi = ref(false)
const reussi = ref(false)

async function soumettre(): Promise<void> {
  envoi.value = true
  erreur.value = ''
  erreurs.value = {}
  try {
    await accepterInvitation({ token: token.value, ...form })
    reussi.value = true
    window.history.replaceState({}, '', window.location.pathname)
  } catch (cause: unknown) {
    if (cause instanceof ApiRequestError) {
      erreurs.value = cause.fieldErrors
      if (!Object.keys(erreurs.value).length) erreur.value = cause.message
    }
  } finally { envoi.value = false }
}
useHead({ title: () => t('invitation.titre') })
</script>

<template>
  <div>
    <h1 class="titre-page">{{ t('invitation.titre') }}</h1>
    <div v-if="reussi" class="invitation__suite"><div class="alerte alerte--succes" role="status">{{ t('invitation.succes') }}</div><NuxtLink class="btn" :to="localePath('/connexion')">{{ t('invitation.connexion') }}</NuxtLink></div>
    <div v-else-if="!token" class="alerte alerte--systeme" role="alert">{{ t('invitation.token_absent') }}</div>
    <form v-else novalidate @submit.prevent="soumettre">
      <p>{{ t('invitation.intro') }}</p>
      <div v-if="erreur" class="alerte alerte--systeme" role="alert" dir="auto">{{ erreur }}</div>
      <label class="champ"><span class="champ__label">{{ t('invitation.mot_de_passe') }}</span><input v-model="form.password" class="champ__saisie" type="password" autocomplete="new-password" required><span v-if="erreurs.password" class="champ__erreur" dir="auto">{{ erreurs.password }}</span></label>
      <label class="champ"><span class="champ__label">{{ t('champs.confirmation') }}</span><input v-model="form.password_confirmation" class="champ__saisie" type="password" autocomplete="new-password" required><span v-if="erreurs.password_confirmation" class="champ__erreur" dir="auto">{{ erreurs.password_confirmation }}</span></label>
      <button class="btn btn--bloc" type="submit" :disabled="envoi">{{ envoi ? t('invitation.envoi') : t('invitation.action') }}</button>
    </form>
  </div>
</template>

<style scoped>.invitation__suite { display: grid; gap: var(--e-4); }</style>
