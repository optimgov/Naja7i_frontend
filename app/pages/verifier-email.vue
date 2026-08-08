<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { user, verifyEmail, resendVerification, fetchMe } = useAuth()

type Etat = 'verification' | 'reussi' | 'echec' | 'attente'

const etat = ref<Etat>('attente')
const message = ref('')
const renvoiFait = ref(false)
const renvoiEnCours = ref(false)

// Le jeton arrive dans l'URL du lien reçu par e-mail. Il est consommé
// immédiatement, puis retiré de l'URL : un jeton ne doit pas rester dans
// l'historique du navigateur ni dans un référent transmis à un tiers.
onMounted(async () => {
  const token = route.query.token as string | undefined

  if (!token) {
    await fetchMe()
    etat.value = user.value?.email_verified ? 'reussi' : 'attente'
    return
  }

  etat.value = 'verification'

  try {
    await verifyEmail(token)
    etat.value = 'reussi'
    window.history.replaceState({}, '', window.location.pathname)
  } catch (e) {
    etat.value = 'echec'
    message.value = e instanceof ApiRequestError ? e.error.message : t('errors.network')
  }
})

async function renvoyer() {
  if (!user.value?.email) return
  renvoiEnCours.value = true

  try {
    await resendVerification(user.value.email)
    renvoiFait.value = true
  } finally {
    renvoiEnCours.value = false
  }
}

useHead({ title: t('verification.titre') })
</script>

<template>
  <div>
    <h1>{{ t('verification.titre') }}</h1>

    <p v-if="etat === 'verification'" class="sous-titre">{{ t('verification.en_cours') }}</p>

    <template v-else-if="etat === 'reussi'">
      <div class="alerte alerte--succes" role="status">{{ t('verification.reussi') }}</div>
      <NuxtLink :to="localePath('/app')" class="bouton bouton--lien">
        {{ t('verification.continuer') }}
      </NuxtLink>
    </template>

    <template v-else-if="etat === 'echec'">
      <div class="alerte" role="alert">{{ message }}</div>
      <p class="sous-titre">{{ t('verification.echec_aide') }}</p>
      <button class="bouton" :disabled="renvoiEnCours || renvoiFait" @click="renvoyer">
        {{ renvoiFait ? t('verification.renvoye') : t('verification.renvoyer') }}
      </button>
    </template>

    <template v-else>
      <p class="sous-titre">
        {{ t('verification.attente', { email: user?.email ?? '' }) }}
      </p>
      <div v-if="renvoiFait" class="alerte alerte--succes" role="status">
        {{ t('verification.renvoye_detail') }}
      </div>
      <button class="bouton" :disabled="renvoiEnCours || renvoiFait" @click="renvoyer">
        {{ renvoiFait ? t('verification.renvoye') : t('verification.renvoyer') }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.sous-titre { margin-block-end: var(--espace-4); color: var(--texte-doux); font-size: var(--taille-s); }
.bouton--lien { display: block; text-align: center; text-decoration: none; }
</style>
