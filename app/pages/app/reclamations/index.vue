<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'
import {
  creerCleIdempotence,
  type CategorieReclamation,
  type Reclamation,
} from '~/composables/useReclamations'

definePageMeta({ layout: 'app', middleware: 'auth' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { lister, creer } = useReclamations()

const page = ref(1)
const {
  data: liste,
  pending: chargement,
  error: erreurChargement,
  refresh: rafraichir,
} = await useAsyncData(
  'reclamations:liste',
  () => lister(page.value),
  { watch: [page] },
)

const formulaire = reactive({
  category: '' as CategorieReclamation | '',
  subject: '',
  body: '',
})
const envoi = ref(false)
const erreursChamps = ref<Record<string, string>>({})
const erreurEnvoi = ref('')
const cleCreation = ref<string | null>(null)

const reclamations = computed<Reclamation[]>(() => liste.value?.data ?? [])
const aUnePagePrecedente = computed(() => Boolean(liste.value?.links.prev))
const aUnePageSuivante = computed(() => Boolean(liste.value?.links.next))

watch(
  () => [formulaire.category, formulaire.subject, formulaire.body],
  () => {
    if (!envoi.value) cleCreation.value = null
  },
)

function libelleCategorie(categorie: CategorieReclamation): string {
  return t(`reclamations.categorie_${categorie}`)
}

function libelleStatut(statut: Reclamation['status']): string {
  return t(`reclamations.statut_${statut}`)
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

async function envoyer(): Promise<void> {
  if (envoi.value || !formulaire.category) return

  envoi.value = true
  erreursChamps.value = {}
  erreurEnvoi.value = ''
  cleCreation.value ??= creerCleIdempotence()

  try {
    const reponse = await creer({
      category: formulaire.category,
      subject: formulaire.subject.trim(),
      body: formulaire.body.trim(),
    }, cleCreation.value)

    cleCreation.value = null
    await navigateTo(localePath(`/app/reclamations/${reponse.data.uuid}`))
  }
  catch (cause: unknown) {
    if (cause instanceof ApiRequestError) {
      erreursChamps.value = cause.fieldErrors
      if (!Object.keys(erreursChamps.value).length) erreurEnvoi.value = cause.message
    }
    else {
      erreurEnvoi.value = t('errors.network')
    }
  }
  finally {
    envoi.value = false
  }
}

function pagePrecedente(): void {
  if (aUnePagePrecedente.value) page.value = Math.max(1, page.value - 1)
}

function pageSuivante(): void {
  if (aUnePageSuivante.value) page.value += 1
}

async function relancerChargement(): Promise<void> {
  await rafraichir()
}

useHead({ title: () => t('reclamations.titre') })
</script>

<template>
  <div class="enveloppe reclamations">
    <p class="oeil">{{ t('reclamations.oeil') }}</p>
    <h1 class="titre-page">{{ t('reclamations.titre') }}</h1>
    <GuideEcran cle="reclamations" />
    <p class="chapeau">{{ t('reclamations.intro') }}</p>

    <section class="reclamations__creation" aria-labelledby="nouvelle-reclamation">
      <h2 id="nouvelle-reclamation">{{ t('reclamations.nouvelle_titre') }}</h2>
      <p>{{ t('reclamations.nouvelle_intro') }}</p>

      <div v-if="erreurEnvoi" class="alerte alerte--systeme" role="alert" dir="auto">
        {{ erreurEnvoi }}
      </div>

      <form class="reclamations__formulaire" @submit.prevent="envoyer">
        <label class="champ" for="reclamation-categorie">
          <span class="champ__label">{{ t('reclamations.categorie') }}</span>
          <select
            id="reclamation-categorie"
            v-model="formulaire.category"
            class="champ__saisie"
            required
            :disabled="envoi"
            :aria-invalid="Boolean(erreursChamps.category)"
            :aria-describedby="erreursChamps.category ? 'erreur-reclamation-categorie' : undefined"
          >
            <option value="" disabled>{{ t('reclamations.categorie_choisir') }}</option>
            <option value="technical">{{ t('reclamations.categorie_technical') }}</option>
            <option value="pedagogical">{{ t('reclamations.categorie_pedagogical') }}</option>
            <option value="account">{{ t('reclamations.categorie_account') }}</option>
            <option value="payment">{{ t('reclamations.categorie_payment') }}</option>
            <option value="other">{{ t('reclamations.categorie_other') }}</option>
          </select>
          <span
            v-if="erreursChamps.category"
            id="erreur-reclamation-categorie"
            class="champ__erreur"
            dir="auto"
          >{{ erreursChamps.category }}</span>
        </label>

        <label class="champ" for="reclamation-objet">
          <span class="champ__label">{{ t('reclamations.objet') }}</span>
          <input
            id="reclamation-objet"
            v-model="formulaire.subject"
            class="champ__saisie"
            type="text"
            required
            maxlength="160"
            :disabled="envoi"
            :aria-invalid="Boolean(erreursChamps.subject)"
            :aria-describedby="erreursChamps.subject ? 'erreur-reclamation-objet' : undefined"
          >
          <span
            v-if="erreursChamps.subject"
            id="erreur-reclamation-objet"
            class="champ__erreur"
            dir="auto"
          >{{ erreursChamps.subject }}</span>
        </label>

        <label class="champ" for="reclamation-message">
          <span class="champ__label">{{ t('reclamations.message') }}</span>
          <textarea
            id="reclamation-message"
            v-model="formulaire.body"
            class="champ__saisie reclamations__texte"
            required
            maxlength="5000"
            :disabled="envoi"
            :aria-invalid="Boolean(erreursChamps.body)"
            :aria-describedby="erreursChamps.body ? 'erreur-reclamation-message' : undefined"
          />
          <span
            v-if="erreursChamps.body"
            id="erreur-reclamation-message"
            class="champ__erreur"
            dir="auto"
          >{{ erreursChamps.body }}</span>
        </label>

        <button class="btn" type="submit" :disabled="envoi">
          {{ envoi ? t('reclamations.envoi') : t('reclamations.envoyer') }}
        </button>
      </form>
    </section>

    <section class="reclamations__liste" aria-labelledby="mes-reclamations">
      <h2 id="mes-reclamations">{{ t('reclamations.liste_titre') }}</h2>

      <p v-if="chargement" role="status">{{ t('reclamations.chargement') }}</p>

      <div v-else-if="erreurChargement" class="alerte alerte--systeme" role="alert">
        <span dir="auto">{{ messageErreur(erreurChargement) }}</span>
        <button class="btn btn--fantome" type="button" @click="relancerChargement">
          {{ t('reclamations.reessayer') }}
        </button>
      </div>

      <div v-else-if="reclamations.length === 0" class="reclamations__vide">
        <h3>{{ t('reclamations.vide_titre') }}</h3>
        <p>{{ t('reclamations.vide_texte') }}</p>
      </div>

      <ul v-else class="reclamations__cartes">
        <li v-for="reclamation in reclamations" :key="reclamation.uuid">
          <NuxtLink
            class="reclamation-carte"
            :to="localePath(`/app/reclamations/${reclamation.uuid}`)"
          >
            <span class="reclamation-carte__objet" dir="auto">{{ reclamation.subject }}</span>
            <span class="reclamation-carte__details">
              <span>{{ libelleCategorie(reclamation.category) }}</span>
              <span class="reclamation-carte__statut">{{ libelleStatut(reclamation.status) }}</span>
            </span>
            <span v-if="dateEnClair(reclamation.last_message_at)" class="reclamation-carte__date">
              {{ t('reclamations.derniere_activite', { date: dateEnClair(reclamation.last_message_at) }) }}
            </span>
          </NuxtLink>
        </li>
      </ul>

      <nav
        v-if="!chargement && !erreurChargement && (aUnePagePrecedente || aUnePageSuivante)"
        class="reclamations__pagination"
        :aria-label="t('reclamations.pagination')"
      >
        <button
          v-if="aUnePagePrecedente"
          class="btn btn--fantome"
          type="button"
          @click="pagePrecedente"
        >{{ t('reclamations.precedente') }}</button>
        <button
          v-if="aUnePageSuivante"
          class="btn btn--fantome"
          type="button"
          @click="pageSuivante"
        >{{ t('reclamations.suivante') }}</button>
      </nav>
    </section>
  </div>
</template>

<style scoped>
.reclamations { padding-block: var(--e-4) var(--e-7); }

.reclamations__creation,
.reclamations__liste {
  margin-block-start: var(--e-6);
  padding-block-start: var(--e-5);
  border-block-start: 1px solid var(--bordure);
}

.reclamations__creation > p {
  max-inline-size: 62ch;
  color: var(--texte-doux);
}

.reclamations__formulaire {
  display: grid;
  gap: var(--e-4);
  max-inline-size: 42rem;
}

.reclamations__texte { min-block-size: 9rem; resize: vertical; }

.reclamations__cartes {
  display: grid;
  gap: var(--e-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.reclamation-carte {
  display: grid;
  gap: var(--e-2);
  padding: var(--e-4);
  color: var(--texte);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r-m);
  text-decoration: none;
}

.reclamation-carte:hover { border-color: var(--accent); }
.reclamation-carte:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.reclamation-carte__objet { font-weight: 700; }
.reclamation-carte__details { display: flex; flex-wrap: wrap; gap: var(--e-2) var(--e-4); font-size: var(--t-sm); }
.reclamation-carte__statut { font-weight: 700; }
.reclamation-carte__date { font-size: var(--t-xs); color: var(--texte-doux); }

.reclamations__vide {
  padding: var(--e-6) var(--e-4);
  text-align: center;
  color: var(--texte-doux);
  background: var(--surface-douce);
  border-radius: var(--r-m);
}

.reclamations__vide h3 { color: var(--texte); }
.reclamations__pagination { display: flex; flex-wrap: wrap; gap: var(--e-2); margin-block-start: var(--e-4); }
</style>
