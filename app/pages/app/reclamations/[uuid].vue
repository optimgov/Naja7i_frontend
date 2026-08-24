<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'
import {
  creerCleIdempotence,
  ordonnerMessagesChronologiquement,
  type Reclamation,
} from '~/composables/useReclamations'

definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { lire, messages, repondre } = useReclamations()
const uuid = computed(() => String(route.params.uuid))
const pageMessages = ref(1)

const {
  data: fil,
  pending: chargement,
  error: erreurChargement,
  refresh: rafraichir,
} = await useAsyncData(
  () => `reclamation:${uuid.value}:messages:${pageMessages.value}`,
  async () => {
    const [reclamation, conversation] = await Promise.all([
      lire(uuid.value),
      messages(uuid.value, pageMessages.value),
    ])
    return {
      reclamation: reclamation.data,
      messages: ordonnerMessagesChronologiquement(conversation.data),
      liensMessages: conversation.links,
      metaMessages: conversation.meta,
    }
  },
  { watch: [uuid, pageMessages] },
)

const reponse = ref('')
const envoi = ref(false)
const erreurEnvoi = ref('')
const erreurChamp = ref('')
const succes = ref(false)
const cleReponse = ref<string | null>(null)
const aDesMessagesPrecedents = computed(() => Boolean(fil.value?.liensMessages.prev))
const aDesMessagesSuivants = computed(() => Boolean(fil.value?.liensMessages.next))

watch(reponse, () => {
  if (!envoi.value) cleReponse.value = null
})

function libelleCategorie(reclamation: Reclamation): string {
  return t(`reclamations.categorie_${reclamation.category}`)
}

function libelleStatut(reclamation: Reclamation): string {
  return t(`reclamations.statut_${reclamation.status}`)
}

function dateEnClair(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleString(locale.value === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function messageErreur(cause: unknown): string {
  return cause instanceof ApiRequestError ? cause.message : t('errors.network')
}

async function envoyerReponse(): Promise<void> {
  if (envoi.value || reponse.value.trim() === '') return

  envoi.value = true
  erreurEnvoi.value = ''
  erreurChamp.value = ''
  succes.value = false
  cleReponse.value ??= creerCleIdempotence()

  try {
    await repondre(uuid.value, reponse.value.trim(), cleReponse.value)
    cleReponse.value = null
    reponse.value = ''

    // Une réponse est ajoutée à la fin du fil. À partir des métadonnées de la
    // page lue, on rejoint la page qui doit la contenir ; si elle ne change
    // pas, on relit explicitement la page courante.
    const meta = fil.value?.metaMessages
    const dernierePageApresEnvoi = meta && meta.per_page > 0
      ? Math.max(1, Math.ceil((meta.total + 1) / meta.per_page))
      : pageMessages.value

    if (dernierePageApresEnvoi === pageMessages.value) await rafraichir()
    else pageMessages.value = dernierePageApresEnvoi

    succes.value = true
  }
  catch (cause: unknown) {
    if (cause instanceof ApiRequestError) {
      erreurChamp.value = cause.fieldErrors.body ?? ''
      if (!erreurChamp.value) erreurEnvoi.value = cause.message
    }
    else {
      erreurEnvoi.value = t('errors.network')
    }
  }
  finally {
    envoi.value = false
  }
}

async function relancerChargement(): Promise<void> {
  await rafraichir()
}

function messagesPrecedents(): void {
  if (aDesMessagesPrecedents.value) pageMessages.value = Math.max(1, pageMessages.value - 1)
}

function messagesSuivants(): void {
  if (aDesMessagesSuivants.value) pageMessages.value += 1
}

useHead({ title: () => fil.value?.reclamation.subject || t('reclamations.detail_titre') })
</script>

<template>
  <div class="enveloppe reclamation">
    <NuxtLink class="lien-second reclamation__retour" :to="localePath('/app/reclamations')">
      {{ t('reclamations.retour_liste') }}
    </NuxtLink>

    <p v-if="chargement" role="status">{{ t('reclamations.chargement_fil') }}</p>

    <div v-else-if="erreurChargement" class="alerte alerte--systeme" role="alert">
      <span dir="auto">{{ messageErreur(erreurChargement) }}</span>
      <button class="btn btn--fantome" type="button" @click="relancerChargement">
        {{ t('reclamations.reessayer') }}
      </button>
    </div>

    <template v-else-if="fil">
      <p class="oeil">{{ libelleCategorie(fil.reclamation) }}</p>
      <h1 class="titre-page" dir="auto">{{ fil.reclamation.subject }}</h1>
      <p class="reclamation__statut">{{ libelleStatut(fil.reclamation) }}</p>

      <section aria-labelledby="conversation-reclamation">
        <h2 id="conversation-reclamation">{{ t('reclamations.conversation') }}</h2>
        <ol class="messages">
          <li
            v-for="message in fil.messages"
            :key="message.uuid"
            class="message"
            :class="`message--${message.sender}`"
          >
            <div class="message__entete">
              <strong>{{ message.sender === 'staff' ? t('reclamations.equipe') : t('reclamations.vous') }}</strong>
              <time v-if="dateEnClair(message.created_at)" :datetime="message.created_at">
                {{ dateEnClair(message.created_at) }}
              </time>
            </div>
            <p class="message__corps" dir="auto">{{ message.body }}</p>
          </li>
        </ol>

        <nav
          v-if="aDesMessagesPrecedents || aDesMessagesSuivants"
          class="messages__pagination"
          :aria-label="t('reclamations.pagination_messages')"
        >
          <button
            v-if="aDesMessagesPrecedents"
            class="btn btn--fantome"
            type="button"
            @click="messagesPrecedents"
          >{{ t('reclamations.messages_precedents') }}</button>
          <button
            v-if="aDesMessagesSuivants"
            class="btn btn--fantome"
            type="button"
            @click="messagesSuivants"
          >{{ t('reclamations.messages_suivants') }}</button>
        </nav>
      </section>

      <section class="reclamation__reponse" aria-labelledby="repondre-reclamation">
        <h2 id="repondre-reclamation">{{ t('reclamations.repondre_titre') }}</h2>
        <p>{{ t('reclamations.repondre_intro') }}</p>

        <div v-if="erreurEnvoi" class="alerte alerte--systeme" role="alert" dir="auto">
          {{ erreurEnvoi }}
        </div>
        <div v-if="succes" class="alerte alerte--succes" role="status">
          {{ t('reclamations.reponse_envoyee') }}
        </div>

        <form class="reclamation__formulaire" @submit.prevent="envoyerReponse">
          <label class="champ" for="reclamation-reponse">
            <span class="champ__label">{{ t('reclamations.votre_reponse') }}</span>
            <textarea
              id="reclamation-reponse"
              v-model="reponse"
              class="champ__saisie reclamation__texte"
              required
              maxlength="5000"
              :disabled="envoi"
              :aria-invalid="Boolean(erreurChamp)"
              :aria-describedby="erreurChamp ? 'erreur-reclamation-reponse' : undefined"
            />
            <span
              v-if="erreurChamp"
              id="erreur-reclamation-reponse"
              class="champ__erreur"
              dir="auto"
            >{{ erreurChamp }}</span>
          </label>
          <button class="btn" type="submit" :disabled="envoi">
            {{ envoi ? t('reclamations.reponse_envoi') : t('reclamations.reponse_action') }}
          </button>
        </form>
      </section>
    </template>
  </div>
</template>

<style scoped>
.reclamation { padding-block: var(--e-4) var(--e-7); }
.reclamation__retour { margin-block-end: var(--e-5); }
.reclamation__statut { margin-block: 0 var(--e-5); font-weight: 700; color: var(--texte-doux); }

.messages {
  display: grid;
  gap: var(--e-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.message {
  inline-size: min(100%, 44rem);
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r-m);
}

.message--candidate { margin-inline-start: auto; border-color: var(--accent); }
.message--staff { margin-inline-end: auto; background: var(--surface-douce); }
.message__entete { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--e-2); font-size: var(--t-sm); }
.message__entete time { color: var(--texte-doux); }
.message__corps { margin-block: var(--e-3) 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.messages__pagination { display: flex; flex-wrap: wrap; gap: var(--e-2); margin-block-start: var(--e-4); }

.reclamation__reponse {
  margin-block-start: var(--e-6);
  padding-block-start: var(--e-5);
  border-block-start: 1px solid var(--bordure);
}

.reclamation__reponse > p { max-inline-size: 62ch; color: var(--texte-doux); }
.reclamation__formulaire { display: grid; gap: var(--e-3); max-inline-size: 44rem; }
.reclamation__texte { min-block-size: 8rem; resize: vertical; }
</style>
