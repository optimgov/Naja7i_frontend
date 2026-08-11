<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

/**
 * E2 — ce que le diagnostic mesure, sa durée, son lancement.
 *
 * L'écran dit AUSSI ce qui n'est pas mesuré. Ce n'est pas de la modestie :
 * « aucun score prédictif de réussite au concours, sous aucun nom » est une
 * règle permanente du produit, et un candidat qui s'apprête à passer un
 * diagnostic est exactement la personne qui suppose le contraire.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { ouvrir } = useTentative()
const { noter } = useSuivi()

const codeEpreuve = computed(() => String(route.params.epreuve ?? ''))

const lancement = ref(false)
const erreur = ref<ApiRequestError | null>(null)

async function lancer(): Promise<void> {
  // Garde de double clic côté client — la vraie garantie est l'en-tête
  // Idempotency-Key posé par `ouvrir`, celle-ci n'évite que l'aller-retour.
  if (lancement.value) return
  lancement.value = true
  erreur.value = null

  try {
    const tentative = await ouvrir(codeEpreuve.value)

    noter({
      codeEpreuve: tentative.exam.code,
      nomEpreuve: tentative.exam.name,
      derniereTentative: tentative.uuid,
    })

    await navigateTo(localePath(`/app/tentative/${tentative.uuid}`))
  } catch (e: unknown) {
    if (e instanceof ApiRequestError) erreur.value = e
    else throw e
  } finally {
    lancement.value = false
  }
}

const indisponible = computed(() => erreur.value?.error.code === 'DIAGNOSTIC_NOT_AVAILABLE')

useHead({ title: t('diagnostic.titre') })
</script>

<template>
  <div class="enveloppe">
    <p class="oeil">{{ t('diagnostic.oeil') }}</p>
    <h1 class="titre-page">{{ t('diagnostic.titre') }}</h1>
    <p class="chapeau">{{ t('diagnostic.intro') }}</p>

    <!-- Banque en cours de constitution : message du serveur, pas un code
         d'erreur. Le candidat n'a pas à connaître nos codes d'état. -->
    <div v-if="indisponible" class="alerte alerte--info" role="status">
      <span dir="auto">{{ t('diagnostic.indisponible') }}</span>
    </div>

    <div v-else-if="erreur" class="alerte alerte--systeme" role="alert">
      <div>
        <span dir="auto">{{ erreur.message }}</span>
        <span v-if="erreur.error.request_id" class="alerte__reference">
          {{ t('errors.reference') }} {{ erreur.error.request_id }}
        </span>
      </div>
    </div>

    <div class="mesure">
      <section class="mesure__bloc">
        <h2 class="mesure__titre">{{ t('diagnostic.ce_qui_est_mesure') }}</h2>
        <ul class="mesure__liste">
          <li>{{ t('diagnostic.mesure_1') }}</li>
          <li>{{ t('diagnostic.mesure_2') }}</li>
          <li>{{ t('diagnostic.mesure_3') }}</li>
        </ul>
      </section>

      <section class="mesure__bloc mesure__bloc--reserve">
        <h2 class="mesure__titre">{{ t('diagnostic.pas_mesure') }}</h2>
        <ul class="mesure__liste">
          <li>{{ t('diagnostic.pas_mesure_1') }}</li>
        </ul>
      </section>
    </div>

    <p class="avertissement">{{ t('diagnostic.certitude_avertissement') }}</p>

    <div class="lancement">
      <button type="button" class="btn btn--grand" :disabled="lancement || indisponible" @click="lancer">
        {{ lancement ? t('diagnostic.lancement') : t('diagnostic.lancer') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.mesure {
  display: grid;
  gap: var(--e-4);
  margin-block: var(--e-5);
}

@media (min-width: 48rem) {
  .mesure { grid-template-columns: 1fr 1fr; }
}

.mesure__bloc {
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.mesure__bloc--reserve {
  background: var(--surface-douce);
}

.mesure__titre {
  margin-block: 0 var(--e-3);
  font-size: var(--t-md);
  font-weight: 700;
}

.mesure__liste {
  margin: 0;
  padding-inline-start: var(--e-4);
  font-size: var(--t-sm);
  line-height: 1.7;
  color: var(--texte-doux);
}

.avertissement {
  max-inline-size: 60ch;
  margin-block: 0 var(--e-5);
  font-size: var(--t-sm);
  color: var(--texte);
}

.lancement {
  display: flex;
  gap: var(--e-4);
  align-items: center;
  flex-wrap: wrap;
}
</style>
