<script setup lang="ts">
import type { Certitude } from '~/composables/useTentative'
import { ApiRequestError } from '~/composables/useApi'

/**
 * E3 — la passation.
 *
 * `data-zone="examen"` n'est pas décoratif : il met `--d-correction` à 0 et
 * masque justifications et autopsies AU NIVEAU DU CSS. C'est une seconde
 * serrure, indépendante du typage : même si un composant recevait un jour une
 * justification, elle ne s'afficherait pas sur cet écran.
 *
 * La première serrure est le contrat : `AttemptQuestionResource` est une liste
 * blanche stricte. On ne demande rien d'autre, on ne précharge pas la
 * correction, on ne la met pas en cache.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const {
  tentative, chargement, charger, repondre, soumettre,
  secondesRestantes, demarrerBattement,
} = useTentative()

const uuid = computed(() => String(route.params.uuid ?? ''))

/*
 * SÉRIE PLUS COURTE QUE DEMANDÉE — règle 3.
 *
 * Le serveur sert parfois moins que demandé quand le périmètre est mince ; il
 * ne complète jamais hors périmètre. L'écart est transmis par E7 dans l'URL,
 * pas dans un état partagé : cet écran est atteignable par son adresse et
 * survit aux rechargements, un état en mémoire ne le ferait pas — et le
 * candidat verrait six questions sans savoir qu'il en avait demandé quinze.
 */
const demandees = computed(() => Number(route.query.demandees ?? 0))
const servies = computed(() => Number(route.query.servies ?? 0))
const resservies = computed(() => Number(route.query.resservies ?? 0))
const serieCourte = computed(() => demandees.value > 0 && servies.value > 0 && servies.value < demandees.value)

const position = ref(0)
const certitude = ref<Certitude | null>(null)
const optionChoisie = ref<string | null>(null)
const manqueCertitude = ref(false)
const envoi = ref(false)
const confirmation = ref(false)
const erreur = ref<ApiRequestError | null>(null)
let ouvertA = Date.now()

const item = computed(() => tentative.value?.items[position.value] ?? null)
const total = computed(() => tentative.value?.item_count ?? 0)
const repondues = computed(() => tentative.value?.answered_count ?? 0)
const manquantes = computed(() => total.value - repondues.value)

await charger(uuid.value).catch((e: unknown) => {
  if (e instanceof ApiRequestError) erreur.value = e
  else throw e
})

if (tentative.value) {
}

onMounted(() => demarrerBattement())

/** Rejoue l'état déjà enregistré quand on revient sur une question. */
watch(
  item,
  (courant) => {
    optionChoisie.value = courant?.selected_option_uuid ?? null
    certitude.value = courant?.confidence ?? null
    manqueCertitude.value = false
    ouvertA = Date.now()
  },
  { immediate: true },
)

const minutes = computed(() => {
  const s = secondesRestantes.value
  if (s === null) return null
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
})

/**
 * Enregistre. `confidence` est REQUIS par l'API — ce n'est pas une option
 * d'interface mais le champ qui rend possibles « erreur avec certitude » et
 * « réussite au hasard » dans l'ordonnance (fiche F02). On ne l'invente donc
 * pas par défaut : sans choix du candidat, rien ne part.
 */
async function enregistrer(): Promise<boolean> {
  if (!item.value) return false
  if (!certitude.value) {
    manqueCertitude.value = true
    return false
  }

  try {
    await repondre(item.value.item_uuid, optionChoisie.value, certitude.value, Date.now() - ouvertA)
    return true
  } catch (e: unknown) {
    if (e instanceof ApiRequestError) erreur.value = e
    else throw e
    return false
  }
}

async function suivante(): Promise<void> {
  if (!(await enregistrer())) return
  if (position.value < total.value - 1) position.value += 1
}

function precedente(): void {
  if (position.value > 0) position.value -= 1
}

async function terminer(): Promise<void> {
  if (envoi.value) return
  envoi.value = true
  erreur.value = null

  try {
    await soumettre()
    await navigateTo(localePath(`/app/tentative/${uuid.value}/correction`))
  } catch (e: unknown) {
    if (e instanceof ApiRequestError) erreur.value = e
    else throw e
  } finally {
    envoi.value = false
    confirmation.value = false
  }
}

const CERTITUDES: Certitude[] = ['sure', 'hesitant', 'guess']

useHead({ title: () => t('passation.question_sur', { n: position.value + 1, total: total.value }) })
</script>

<template>
  <div class="enveloppe" data-zone="examen">
    <div v-if="erreur" class="alerte alerte--systeme" role="alert">
      <div>
        <span dir="auto">{{ erreur.message }}</span>
        <span v-if="erreur.error.request_id" class="alerte__reference">
          {{ t('errors.reference') }} {{ erreur.error.request_id }}
        </span>
      </div>
    </div>

    <!-- Dit AVANT la première question, pas au moment du résultat : une série
         plus courte qu'annoncée se lit autrement si on l'apprend à la fin. -->
    <div v-if="serieCourte" class="alerte alerte--info" role="status">
      <div>
        <strong>{{ t('entrainement.court_titre') }}</strong>
        <span>{{ t('entrainement.court_texte', { served: servies, requested: demandees }) }}</span>
        <span v-if="resservies > 0" class="court__resservies">
          {{ t('entrainement.resservies', { n: resservies }) }}
        </span>
      </div>
    </div>

    <template v-if="tentative && item">
      <header class="passation__entete">
        <p class="passation__compteur">
          {{ t('passation.question_sur', { n: position + 1, total }) }}
        </p>

        <p v-if="minutes" class="passation__temps">
          <span class="passation__temps-libelle">{{ t('passation.temps_restant') }}</span>
          <!-- Le décompte est un AFFICHAGE. La décision revient au serveur, qui
               renvoie `seconds_remaining` à chaque réponse. -->
          <time class="passation__temps-valeur">{{ minutes }}</time>
        </p>
      </header>

      <progress class="passation__jauge" :value="repondues" :max="total" />
      <p class="passation__avancement">{{ t('passation.repondues', { n: repondues, total }) }}</p>

      <h1 class="passation__enonce" dir="auto">{{ item.question.stem }}</h1>

      <fieldset class="options">
        <legend class="lecture-seule">{{ item.question.stem }}</legend>

        <label v-for="option in item.question.options" :key="option.uuid" class="option">
          <input
            v-model="optionChoisie"
            type="radio"
            class="option__choix"
            :name="`item-${item.item_uuid}`"
            :value="option.uuid"
          >
          <span class="option__texte" dir="auto">{{ option.content }}</span>
        </label>
      </fieldset>

      <fieldset class="certitude">
        <legend class="certitude__titre">{{ t('passation.certitude_titre') }}</legend>

        <div class="certitude__choix">
          <label v-for="niveau in CERTITUDES" :key="niveau" class="certitude__option">
            <input
              v-model="certitude"
              type="radio"
              class="certitude__radio"
              name="certitude"
              :value="niveau"
            >
            <span class="certitude__libelle">{{ t(`passation.${niveau}`) }}</span>
            <span class="certitude__aide">{{ t(`passation.${niveau}_aide`) }}</span>
          </label>
        </div>

        <p v-if="manqueCertitude" class="champ__erreur" role="alert">
          {{ t('passation.certitude_obligatoire') }}
        </p>
      </fieldset>

      <div class="passation__actes">
        <button type="button" class="btn btn--fantome" :disabled="position === 0" @click="precedente">
          {{ t('passation.precedente') }}
        </button>

        <button
          v-if="position < total - 1"
          type="button"
          class="btn"
          @click="suivante"
        >
          {{ t('passation.suivante') }}
        </button>

        <button
          v-else
          type="button"
          class="btn"
          @click="enregistrer().then((ok) => { if (ok) confirmation = true })"
        >
          {{ t('passation.terminer') }}
        </button>
      </div>
    </template>

    <p v-else-if="chargement" class="passation__attente">…</p>

    <!-- Confirmation : la soumission fige la série. On le dit avant, pas après. -->
    <div v-if="confirmation" class="voile" role="dialog" aria-modal="true" :aria-label="t('passation.confirmer_titre')">
      <div class="voile__carte">
        <h2 class="voile__titre">{{ t('passation.confirmer_titre') }}</h2>
        <p class="voile__texte">{{ t('passation.confirmer_texte') }}</p>
        <p v-if="manquantes > 0" class="voile__texte voile__texte--attention">
          {{ t('passation.confirmer_manquantes') }}
        </p>

        <div class="voile__actes">
          <button type="button" class="btn" :disabled="envoi" @click="terminer">
            {{ envoi ? t('passation.terminer_en_cours') : t('passation.confirmer_oui') }}
          </button>
          <button type="button" class="btn btn--fantome" :disabled="envoi" @click="confirmation = false">
            {{ t('passation.confirmer_non') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.passation__entete {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--e-3);
}

.passation__compteur {
  margin: 0;
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--texte-doux);
}

.passation__temps {
  display: flex;
  gap: var(--e-2);
  align-items: baseline;
  margin: 0;
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

.passation__temps-valeur {
  font-family: var(--mono);
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--texte);
}

.passation__jauge {
  inline-size: 100%;
  block-size: 6px;
  margin-block-start: var(--e-2);
  appearance: none;
  border: 0;
  border-radius: 999px;
  background: var(--surface-douce);
  overflow: hidden;
}

.passation__jauge::-webkit-progress-bar { background: var(--surface-douce); }
.passation__jauge::-webkit-progress-value { background: var(--accent); }
.passation__jauge::-moz-progress-bar { background: var(--accent); }

.passation__avancement {
  margin-block: var(--e-2) var(--e-5);
  font-size: var(--t-xs);
  color: var(--texte-doux);
}

.passation__enonce {
  margin-block: 0 var(--e-5);
  font-size: var(--t-xl);
  font-weight: 700;
  line-height: 1.45;
}

.options,
.certitude {
  margin: 0 0 var(--e-5);
  padding: 0;
  border: 0;
}

.option {
  display: flex;
  gap: var(--e-3);
  align-items: flex-start;
  margin-block-end: var(--e-2);
  padding: var(--e-3) var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  cursor: pointer;
}

.option:hover { border-color: var(--bordure-forte); }

.option:has(.option__choix:checked) {
  border-color: var(--accent);
  background: var(--accent-doux);
}

.option__choix {
  flex: none;
  inline-size: 24px;
  block-size: 24px;
  margin: 0;
  accent-color: var(--accent);
}

.option__texte { line-height: 1.5; }

.certitude__titre {
  padding: 0;
  margin-block-end: var(--e-3);
  font-size: var(--t-sm);
  font-weight: 700;
}

.certitude__choix {
  display: grid;
  gap: var(--e-2);
}

@media (min-width: 42rem) {
  .certitude__choix { grid-template-columns: repeat(3, 1fr); }
}

.certitude__option {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 var(--e-2);
  align-items: center;
  padding: var(--e-3);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  cursor: pointer;
}

.certitude__option:has(.certitude__radio:checked) {
  border-color: var(--accent);
  background: var(--accent-doux);
}

.certitude__radio {
  inline-size: 24px;
  block-size: 24px;
  margin: 0;
  accent-color: var(--accent);
}

.certitude__libelle { font-weight: 700; font-size: var(--t-sm); }

.certitude__aide {
  grid-column: 2;
  font-size: var(--t-xs);
  color: var(--texte-doux);
}

.passation__actes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-3);
}

.passation__attente { color: var(--texte-doux); }

.court__resservies { display: block; margin-block-start: var(--e-1); color: var(--texte-doux); }

.voile {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: var(--e-4);
  background: rgb(0 0 0 / 0.45);
}

.voile__carte {
  inline-size: 100%;
  max-inline-size: 26rem;
  padding: var(--e-5);
  background: var(--surface);
  border-radius: var(--r-m);
  box-shadow: var(--ombre-3);
}

.voile__titre { margin-block: 0 var(--e-2); font-size: var(--t-xl); font-weight: 800; }
.voile__texte { margin-block: 0 var(--e-3); font-size: var(--t-sm); color: var(--texte-doux); }
.voile__texte--attention { color: var(--peda-remede-texte); font-weight: 600; }
.voile__actes { display: flex; gap: var(--e-3); flex-wrap: wrap; }
</style>
