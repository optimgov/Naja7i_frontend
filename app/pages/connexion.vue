<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t } = useI18n()
const { login } = useAuth()
const localePath = useLocalePath()
const route = useRoute()

const form = reactive({ email: '', password: '', remember: false })
const erreur = ref<{ message: string; requestId: string } | null>(null)
const envoi = ref(false)

async function soumettre() {
  envoi.value = true
  erreur.value = null

  try {
    await login(form.email, form.password, form.remember)

    /*
     * ON REVIENT OÙ L'ON ALLAIT — `?suite=`.
     *
     * Un visiteur qui choisit une offre depuis `/tarifs` sans compte passe par
     * ici. Le renvoyer sur `/app` lui demanderait de retrouver son offre seul,
     * et c'est le moment exact où l'on perd un achat.
     *
     * SEULS LES CHEMINS INTERNES SONT SUIVIS. `//evil.example` et
     * `https://evil.example` sont des URL absolues qu'un navigateur suivrait
     * hors du site : accepter la valeur telle quelle ferait de cette page une
     * redirection ouverte, offerte à qui envoie un lien de connexion piégé.
     *
     * La contre-barre est refusée avec le reste : les navigateurs la
     * normalisent en barre oblique au moment de résoudre l'URL, si bien que
     * `/\evil.example` se relit `//evil.example`. Le contrôle porterait alors
     * sur une chaîne que personne ne suit.
     */
    const suite = String(route.query.suite ?? '')
    const interne = /^\/(?![/\\])/.test(suite)

    await navigateTo(interne ? suite : localePath('/app'))
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
    <h1 class="titre-page">{{ t('connexion.titre') }}</h1>
    <p class="sous-titre">{{ t('connexion.sous_titre') }}</p>

    <!-- `alerte--systeme` et non `alerte` seule : la variante porte le signe ⚠
         et les jetons `--sys-err-*`. Sans elle, le bandeau n'avait ni bordure,
         ni fond, ni signe — la classe `.alerte` n'existait nulle part. -->
    <div v-if="erreur" class="alerte alerte--systeme" role="alert">
      <div>
        <span dir="auto">{{ erreur.message }}</span>
        <span v-if="erreur.requestId" class="alerte__reference">
          {{ t('errors.reference') }} {{ erreur.requestId }}
        </span>
      </div>
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
        <input v-model="form.remember" type="checkbox" class="case__coche">
        <span>{{ t('connexion.rester_connecte') }}</span>
      </label>

      <button type="submit" class="btn btn--bloc" :disabled="envoi">
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
/* Jetons v3 directement, plus les alias de compatibilité v1 : ces derniers
   fonctionnent — `--espace-4` pointe sur `--e-5` — mais la correspondance n'est
   pas de un à un, et lire `--espace-4` en croyant obtenir `--e-4` est une
   erreur qui ne se voit pas. */
.sous-titre { margin-block-end: var(--e-5); color: var(--texte-doux); font-size: var(--t-sm); }
.liens { margin-block-start: var(--e-3); font-size: var(--t-sm); text-align: center; }
.bascule-compte { margin-block-start: var(--e-2); font-size: var(--t-sm); text-align: center; color: var(--texte-doux); }
</style>
