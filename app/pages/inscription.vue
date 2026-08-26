<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

definePageMeta({ layout: 'auth', middleware: 'guest' })

const { t, locale } = useI18n()
const { register } = useAuth()
const localePath = useLocalePath()
const route = useRoute()

/* La destination choisie AVANT la création du compte. Elle traverse cet écran
 * sans être suivie ici : l'adresse n'est pas encore vérifiée, et les routes du
 * diagnostic exigent `verified.api`. Elle est passée à l'écran suivant. */
const suite = computed(() => suiteInterne(route.query.suite))

const form = reactive({
  email: '',
  password: '',
  password_confirmation: '',
  terms_accepted: false,
  privacy_notice_acknowledged: false,
  marketing_granted: false,
})

const erreurs = ref<Record<string, string>>({})
const erreurGenerale = ref<{ message: string; requestId: string } | null>(null)
const envoi = ref(false)

async function soumettre() {
  envoi.value = true
  erreurs.value = {}
  erreurGenerale.value = null

  try {
    await register({ ...form, locale: locale.value as 'fr' | 'ar' })
    await navigateTo(avecSuite(localePath('/verifier-email'), suite.value))
  } catch (e) {
    if (e instanceof ApiRequestError) {
      erreurs.value = e.fieldErrors
      if (!Object.keys(erreurs.value).length) {
        erreurGenerale.value = { message: e.error.message, requestId: e.error.request_id }
      }
    }
  } finally {
    envoi.value = false
  }
}

useHead({ title: t('inscription.titre') })
</script>

<template>
  <div>
    <h1 class="titre-page">{{ t('inscription.titre') }}</h1>
    <p class="sous-titre">{{ t('inscription.sous_titre') }}</p>

    <div v-if="erreurGenerale" class="alerte alerte--systeme" role="alert">
      {{ erreurGenerale.message }}
      <span v-if="erreurGenerale.requestId" class="alerte__reference">
        {{ t('errors.reference') }} {{ erreurGenerale.requestId }}
      </span>
    </div>

    <form novalidate @submit.prevent="soumettre">
      <label class="champ">
        <span class="champ__label">{{ t('champs.email') }}</span>
        <input
          v-model="form.email"
          type="email"
          autocomplete="email"
          required
          class="champ__saisie"
          :aria-invalid="Boolean(erreurs.email)"
        >
        <span v-if="erreurs.email" class="champ__erreur">{{ erreurs.email }}</span>
      </label>

      <label class="champ">
        <span class="champ__label">{{ t('champs.mot_de_passe') }}</span>
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
        <input
          v-model="form.password_confirmation"
          type="password"
          autocomplete="new-password"
          required
          class="champ__saisie"
        >
      </label>

      <!--
        Trois actes de nature juridique DIFFÉRENTE (ADR-0005), donc trois cases
        distinctes et aucune pré-cochée. Fusionner les deux premières en une
        seule case « j'accepte tout » ferait perdre la distinction entre
        acceptation contractuelle et prise de connaissance.
      -->
      <fieldset class="actes">
        <legend class="champ__label">{{ t('inscription.actes_legende') }}</legend>

        <label class="case">
          <input v-model="form.terms_accepted" type="checkbox" class="case__coche">
          <span>
            {{ t('inscription.cgu') }}
            <a :href="`/${locale}/conditions`" target="_blank">{{ t('inscription.cgu_lien') }}</a>
          </span>
        </label>
        <span v-if="erreurs.terms_accepted" class="champ__erreur">{{ erreurs.terms_accepted }}</span>

        <label class="case">
          <input v-model="form.privacy_notice_acknowledged" type="checkbox" class="case__coche">
          <span>
            {{ t('inscription.confidentialite') }}
            <a :href="`/${locale}/confidentialite`" target="_blank">{{ t('inscription.confidentialite_lien') }}</a>
          </span>
        </label>
        <span v-if="erreurs.privacy_notice_acknowledged" class="champ__erreur">
          {{ erreurs.privacy_notice_acknowledged }}
        </span>

        <label class="case">
          <input v-model="form.marketing_granted" type="checkbox" class="case__coche">
          <span>{{ t('inscription.rappels') }}</span>
        </label>
        <span class="champ__aide">{{ t('inscription.rappels_aide') }}</span>
      </fieldset>

      <button type="submit" class="btn btn--bloc" :disabled="envoi">
        {{ envoi ? t('inscription.envoi') : t('inscription.action') }}
      </button>
    </form>

    <p class="bascule-compte">
      {{ t('inscription.deja_inscrit') }}
      <NuxtLink :to="avecSuite(localePath('/connexion'), suite)">{{ t('inscription.se_connecter') }}</NuxtLink>
    </p>
  </div>
</template>

<style scoped>
.sous-titre {
  margin-block-end: var(--e-5);
  color: var(--texte-doux);
  font-size: var(--t-s);
}

.identite { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--e-3); }
@media (max-width: 34rem) { .identite { grid-template-columns: 1fr; } }

.actes {
  padding: var(--e-3);
  margin-block: var(--e-3);
  margin-inline: 0;
  border: 1px solid var(--bordure);
  border-radius: var(--r-s);
}

.actes legend {
  padding-inline: var(--e-1);
  margin-inline-start: calc(-1 * var(--e-1));
}

.bascule-compte {
  margin-block-start: var(--e-5);
  font-size: var(--t-s);
  text-align: center;
  color: var(--texte-doux);
}
</style>
