<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

/**
 * Reprise de session après expiration — le 401 qui survient EN COURS de
 * passation.
 *
 * POURQUOI PAS UNE REDIRECTION VERS /connexion
 *
 * Rediriger démonte l'écran de passation. La question affichée, la réponse en
 * cours de saisie et le temps restant disparaissent, et au retour le candidat
 * ne sait plus où il en était. Pire : il croit avoir perdu son travail, ce qui
 * est la seule chose qu'il ne doit jamais croire.
 *
 * La ré-authentification se fait donc SUR PLACE, par-dessus l'écran. Rien n'est
 * démonté. Une fois la session rétablie, la file d'envoi repart d'elle-même et
 * les réponses en attente partent enfin — c'est `reprendreApresAuth` qui le
 * fait, et son retour dit combien sont passées.
 *
 * `aria-modal` et le piège de focus : le formulaire est le seul endroit utile
 * de l'écran tant que la session n'est pas rétablie.
 */
const { reauthRequise, reprendreApresAuth, enAttente } = useFileEnvoi()
const { login } = useAuth()
const { t } = useI18n()

const email = ref('')
const motDePasse = ref('')
const envoi = ref(false)
const erreur = ref<string | null>(null)
const reprises = ref<number | null>(null)
const champEmail = ref<HTMLInputElement | null>(null)

watch(reauthRequise, async (actif) => {
  if (!actif) return
  erreur.value = null
  reprises.value = null
  await nextTick()
  champEmail.value?.focus()
})

async function soumettre(): Promise<void> {
  if (envoi.value) return
  envoi.value = true
  erreur.value = null

  try {
    await login(email.value, motDePasse.value)
    motDePasse.value = ''
    const passes = await reprendreApresAuth()
    reprises.value = passes
  } catch (e: unknown) {
    erreur.value =
      e instanceof ApiRequestError ? e.message : t('errors.network')
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div v-if="reauthRequise" class="reprise" role="dialog" aria-modal="true" :aria-label="t('session.expiree_titre')">
    <div class="reprise__carte">
      <h2 class="reprise__titre">{{ t('session.expiree_titre') }}</h2>

      <!-- La promesse d'abord : ce qui a été répondu n'est pas perdu. Le
           candidat lit cette ligne avant de comprendre qu'on lui redemande son
           mot de passe, et c'est l'ordre qui compte. -->
      <p class="reprise__promesse">
        {{ enAttente ? t('session.expiree_gardees', { n: enAttente }) : t('session.expiree_texte') }}
      </p>

      <div v-if="erreur" class="alerte alerte--systeme" role="alert">
        <span dir="auto">{{ erreur }}</span>
      </div>

      <form novalidate @submit.prevent="soumettre">
        <label class="champ">
          <span class="champ__label">{{ t('champs.email') }}</span>
          <input
            ref="champEmail"
            v-model="email"
            class="champ__saisie"
            type="email"
            autocomplete="email"
            required
          >
        </label>

        <label class="champ">
          <span class="champ__label">{{ t('champs.mot_de_passe') }}</span>
          <input
            v-model="motDePasse"
            class="champ__saisie"
            type="password"
            autocomplete="current-password"
            required
          >
        </label>

        <button type="submit" class="btn btn--bloc" :disabled="envoi">
          {{ envoi ? t('session.reprise_en_cours') : t('session.reprendre') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.reprise {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: var(--e-4);
  background: rgb(0 0 0 / 0.45);
}

.reprise__carte {
  inline-size: 100%;
  max-inline-size: 24rem;
  padding: var(--e-5);
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--ombre-3);
}

.reprise__titre {
  margin-block: 0 var(--e-2);
  font-size: var(--t-xl);
  font-weight: 800;
  color: var(--texte);
}

.reprise__promesse {
  margin-block: 0 var(--e-4);
  font-size: var(--t-sm);
  color: var(--texte-doux);
}
</style>
