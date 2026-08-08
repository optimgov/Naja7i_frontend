<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const { login } = useAuth()
const localePath = useLocalePath()

const form = reactive({ email: '', password: '', remember: false })
const erreur = ref<{ message: string; requestId: string } | null>(null)
const envoi = ref(false)

async function soumettre() {
  envoi.value = true
  erreur.value = null

  try {
    await login(form.email, form.password, form.remember)
    await navigateTo(localePath('/app'))
  } catch (e) {
    if (e instanceof ApiRequestError) {
      erreur.value = { message: e.error.message, requestId: e.error.request_id }
    }
  } finally {
    envoi.value = false
  }
}

useHead({ title: t('connexion.titre') })
</script>

<template>
  <div>
    <h1>{{ t('connexion.titre') }}</h1>
    <p class="sous-titre">{{ t('connexion.sous_titre') }}</p>

    <div v-if="erreur" class="alerte" role="alert">
      {{ erreur.message }}
      <span v-if="erreur.requestId" class="alerte__reference">
        {{ t('errors.reference') }} {{ erreur.requestId }}
      </span>
    </div>

    <form novalidate @submit.prevent="soumettre">
      <label class="champ">
        <span class="champ__label">{{ t('champs.email') }}</span>
        <input v-model="form.email" type="email" autocomplete="email" required class="champ__saisie">
      </label>

      <label class="champ">
        <span class="champ__label">{{ t('champs.mot_de_passe') }}</span>
        <input v-model="form.password" type="password" autocomplete="current-password" required class="champ__saisie">
      </label>

      <label class="case">
        <input v-model="form.remember" type="checkbox">
        <span>{{ t('connexion.rester_connecte') }}</span>
      </label>

      <button type="submit" class="bouton" :disabled="envoi">
        {{ envoi ? t('connexion.envoi') : t('connexion.action') }}
      </button>
    </form>

    <p class="liens">
      <NuxtLink :to="localePath('/mot-de-passe-oublie')">{{ t('connexion.mot_de_passe_oublie') }}</NuxtLink>
    </p>
    <p class="bascule-compte">
      {{ t('connexion.pas_de_compte') }}
      <NuxtLink :to="localePath('/inscription')">{{ t('connexion.creer') }}</NuxtLink>
    </p>
  </div>
</template>

<style scoped>
.sous-titre { margin-block-end: var(--espace-4); color: var(--texte-doux); font-size: var(--taille-s); }
.liens { margin-block-start: var(--espace-3); font-size: var(--taille-s); text-align: center; }
.bascule-compte { margin-block-start: var(--espace-2); font-size: var(--taille-s); text-align: center; color: var(--texte-doux); }
</style>
