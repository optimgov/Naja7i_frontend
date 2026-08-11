<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { resetPassword } = useAuth()

const form = reactive({ password: '', password_confirmation: '' })
const erreurs = ref<Record<string, string>>({})
const erreurGenerale = ref('')
const reussi = ref(false)
const envoi = ref(false)

const token = computed(() => (route.query.token as string) ?? '')
const email = computed(() => (route.query.email as string) ?? '')

async function soumettre() {
  envoi.value = true
  erreurs.value = {}
  erreurGenerale.value = ''

  try {
    await resetPassword({
      token: token.value,
      email: email.value,
      password: form.password,
      password_confirmation: form.password_confirmation,
    })
    reussi.value = true
    window.history.replaceState({}, '', window.location.pathname)
  } catch (e) {
    if (e instanceof ApiRequestError) {
      erreurs.value = e.fieldErrors
      if (!Object.keys(erreurs.value).length) erreurGenerale.value = e.error.message
    }
  } finally {
    envoi.value = false
  }
}

useHead({ title: t('nouveau.titre') })
</script>

<template>
  <div>
    <h1 class="titre-page">{{ t('nouveau.titre') }}</h1>

    <template v-if="reussi">
      <div class="alerte alerte--succes" role="status">{{ t('nouveau.reussi') }}</div>
      <NuxtLink :to="localePath('/connexion')" class="btn">
        {{ t('nouveau.se_connecter') }}
      </NuxtLink>
    </template>

    <template v-else-if="!token || !email">
      <div class="alerte alerte--systeme" role="alert">{{ t('nouveau.lien_incomplet') }}</div>
      <NuxtLink :to="localePath('/mot-de-passe-oublie')">{{ t('nouveau.redemander') }}</NuxtLink>
    </template>

    <template v-else>
      <p class="sous-titre">{{ t('nouveau.sous_titre', { email }) }}</p>

      <div v-if="erreurGenerale" class="alerte alerte--systeme" role="alert">{{ erreurGenerale }}</div>

      <form novalidate @submit.prevent="soumettre">
        <label class="champ">
          <span class="champ__label">{{ t('nouveau.champ') }}</span>
          <input
            v-model="form.password"
            type="password"
            autocomplete="new-password"
            required
            class="champ__saisie"
            :aria-invalid="Boolean(erreurs.password)"
          >
          <span v-if="erreurs.password" class="champ__erreur">{{ erreurs.password }}</span>
          <span v-else class="champ__aide">{{ t('inscription.aide_mot_de_passe') }}</span>
        </label>

        <label class="champ">
          <span class="champ__label">{{ t('champs.confirmation') }}</span>
          <input v-model="form.password_confirmation" type="password" autocomplete="new-password" required class="champ__saisie">
        </label>

        <button type="submit" class="btn btn--bloc" :disabled="envoi">
          {{ envoi ? t('nouveau.envoi') : t('nouveau.action') }}
        </button>
      </form>
    </template>
  </div>
</template>

<style scoped>
.sous-titre { margin-block-end: var(--e-5); color: var(--texte-doux); font-size: var(--t-s); }
.bouton--lien { display: block; text-align: center; text-decoration: none; }
</style>
