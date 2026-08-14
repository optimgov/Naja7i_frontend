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
  secondesRestantes, tempsEcoule, demarrerBattement,
} = useTentative()

const uuid = computed(() => String(route.params.uuid ?? ''))

/*
 * ─────────────────────────── E10 — LE MODE EXAMEN ───────────────────────────
 *
 * MÊME ÉCRAN, PAS UN SECOND. La passation d'un examen blanc est la passation :
 * mêmes questions, même certitude requise, même `data-zone="examen"` et donc
 * les mêmes masquages CSS de R06. Un écran jumeau aurait divergé au premier
 * correctif appliqué d'un seul côté — et R06 est exactement la règle qu'on ne
 * veut pas voir diverger.
 *
 * Ce que le genre `simulation` ajoute, et rien d'autre : une grille de
 * navigation avec marquage, un avertissement aux cinq dernières minutes, une
 * bascule à l'échéance, et une sortie vers le RAPPORT plutôt que vers la
 * correction.
 */
const modeExamen = computed(() => tentative.value?.kind === 'simulation')

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

onMounted(() => demarrerBattement())

/*
 * MARQUER POUR Y REVENIR.
 *
 * État de navigation, pas de réponse : le serveur n'en sait rien et n'a pas à
 * en savoir quoi que ce soit. Il vit dans `sessionStorage`, porté par l'uuid de
 * la tentative — un rechargement en pleine épreuve est le cas NORMAL d'un
 * examen de quatre heures, et perdre ses marques à cette occasion serait une
 * punition gratuite. Deux onglets sont deux sessions : c'est la même règle que
 * la clé d'idempotence.
 */
const CLE_MARQUES = 'naja7i.simulation.marques'
const marquees = ref<Set<string>>(new Set())

onMounted(() => {
  try {
    const brut = sessionStorage.getItem(`${CLE_MARQUES}.${uuid.value}`)
    if (brut) marquees.value = new Set(JSON.parse(brut) as string[])
  }
  catch { /* stockage refusé : les marques vivent le temps de la page */ }
})

function basculerMarque(itemUuid: string): void {
  const copie = new Set(marquees.value)
  if (copie.has(itemUuid)) copie.delete(itemUuid)
  else copie.add(itemUuid)
  marquees.value = copie

  try {
    sessionStorage.setItem(`${CLE_MARQUES}.${uuid.value}`, JSON.stringify([...copie]))
  }
  catch { /* idem */ }
}

const marqueesCount = computed(() => marquees.value.size)

/*
 * L'AVERTISSEMENT DES CINQ DERNIÈRES MINUTES — VISUEL ET TEXTUEL.
 *
 * Jamais la couleur seule : sous deutéranopie, un bandeau qui vire au rouge ne
 * dit rien. Le sens est porté par le TEXTE (« il vous reste moins de cinq
 * minutes »), annoncé par `role="alert"` aux lecteurs d'écran, et seulement
 * ensuite souligné par la couleur et la bordure. C'est la règle du dépôt sur
 * l'erreur système contre l'erreur pédagogique, appliquée au temps.
 */
const SEUIL_ALERTE_S = 300
const derniereLigneDroite = computed(
  () => modeExamen.value
    && secondesRestantes.value !== null
    && secondesRestantes.value > 0
    && secondesRestantes.value <= SEUIL_ALERTE_S,
)

/*
 * L'ÉCHÉANCE : LE CLIENT DEMANDE, LE SERVEUR TRANCHE.
 *
 * À zéro, l'écran NE SOUMET PAS de lui-même. Il relit la tentative auprès du
 * serveur — c'est ce qui ré-ancre `seconds_remaining` et efface une dérive
 * d'horloge. Trois issues :
 *
 *   - le serveur rend encore du temps  → le compte à rebours repart, et
 *     l'écran vient d'éviter de clore une épreuve trois minutes trop tôt sur
 *     un poste en avance ;
 *   - la tentative n'est plus en cours → le serveur l'a close, on va au rapport ;
 *   - le serveur rend zéro             → on va au rapport, dont l'appel clôt
 *     la tentative côté serveur.
 *
 * Un client qui déciderait seul serait un second avis sur l'heure. Il n'y en a
 * qu'un, et ce n'est pas celui du navigateur.
 */
const bascule = ref(false)

watch(tempsEcoule, async (ecoule) => {
  if (!ecoule || !modeExamen.value || bascule.value) return
  bascule.value = true

  try {
    await charger(uuid.value)

    const encore = tentative.value
    if (encore && encore.status === 'in_progress' && (secondesRestantes.value ?? 0) > 0) {
      bascule.value = false   // dérive du client : le serveur avait raison.
      return
    }
  }
  catch { /* injoignable : on va au rapport, qui tranchera */ }

  await navigateTo(localePath(`/app/simulation/${uuid.value}/rapport`))
})

/** Vrai quand le serveur a refusé une réponse pour cause d'échéance dépassée. */
const echeanceDepassee = ref(false)

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
    /*
     * RÉPONSE ARRIVÉE APRÈS L'ÉCHÉANCE — refus attendu, pas panne.
     *
     * `ATTEMPT_EXPIRED` porte son propre code précisément pour être distingué
     * ici d'`ATTEMPT_CLOSED` : « votre temps est écoulé, cette réponse est
     * perdue » et « cette série est déjà terminée » n'appellent pas la même
     * phrase. On l'EXPLIQUE plutôt que d'afficher le message brut du serveur
     * dans une alerte système, qui ressemblerait à un incident.
     *
     * Le même refus peut aussi arriver par la FILE hors connexion, quand une
     * réponse mise en file avant l'échéance s'écoule après : la boîte d'échecs
     * la montre, et le bandeau ci-dessous dit pourquoi.
     */
    if (e instanceof ApiRequestError && e.error.code === 'ATTEMPT_EXPIRED') {
      echeanceDepassee.value = true
      return false
    }

    if (e instanceof ApiRequestError) erreur.value = e
    else throw e
    return false
  }
}

/** Va à la question demandée depuis la grille. */
function allerA(index: number): void {
  if (index >= 0 && index < total.value) position.value = index
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

    /* Un examen blanc sort par son RAPPORT — la note au barème pondéré et le
     * détail par section — et non par la correction question par question, qui
     * garde sa route, son quota F03 et son mur payant. */
    await navigateTo(localePath(
      modeExamen.value
        ? `/app/simulation/${uuid.value}/rapport`
        : `/app/tentative/${uuid.value}/correction`,
    ))
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

    <!-- L'échéance est passée pendant que le candidat composait : on EXPLIQUE.
         Le texte porte le sens ; la couleur ne fait que le souligner. -->
    <div v-if="echeanceDepassee" class="alerte alerte--systeme" role="alert">
      <div>
        <strong>{{ t('simulation.echeance_titre') }}</strong>
        <span>{{ t('simulation.echeance_texte') }}</span>
      </div>
    </div>

    <template v-if="tentative && item">
      <header class="passation__entete">
        <p class="passation__compteur">
          {{ t('passation.question_sur', { n: position + 1, total }) }}
        </p>

        <p v-if="minutes" class="passation__temps" :class="{ 'passation__temps--urgent': derniereLigneDroite }">
          <span class="passation__temps-libelle">{{ t('passation.temps_restant') }}</span>
          <!-- Le décompte est un AFFICHAGE. La décision revient au serveur, qui
               renvoie `seconds_remaining` à chaque réponse. -->
          <time class="passation__temps-valeur">{{ minutes }}</time>
        </p>
      </header>

      <!-- ─── Cinq dernières minutes : le TEXTE d'abord, la couleur ensuite ───
           `role="alert"` pour que ce soit annoncé, et non seulement vu. Un
           bandeau qui se contenterait de virer au rouge ne dirait rien sous
           deutéranopie, ni à un lecteur d'écran. -->
      <p v-if="derniereLigneDroite" class="derniere-ligne" role="alert">
        <span class="derniere-ligne__marque" aria-hidden="true">⏱</span>
        <span>
          <strong>{{ t('simulation.bientot_fini_titre') }}</strong>
          {{ t('simulation.bientot_fini_texte') }}
        </span>
      </p>

      <!-- ─── La grille de navigation, propre au mode examen ───
           Un examen blanc se compose dans le désordre : on saute, on revient,
           on marque. Une navigation qui n'offrirait que « précédente / suivante »
           obligerait à traverser vingt questions pour revenir sur la troisième. -->
      <nav v-if="modeExamen" class="grille" :aria-label="t('simulation.grille_titre')">
        <button
          v-for="(q, i) in tentative.items"
          :key="q.item_uuid"
          type="button"
          class="grille__case"
          :class="{
            'grille__case--courante': i === position,
            'grille__case--repondue': q.answered,
            'grille__case--marquee': marquees.has(q.item_uuid),
          }"
          :aria-current="i === position ? 'true' : undefined"
          :aria-label="t('simulation.grille_case', {
            n: i + 1,
            etat: q.answered ? t('simulation.grille_repondue') : t('simulation.grille_vide'),
            marque: marquees.has(q.item_uuid) ? t('simulation.grille_marquee') : '',
          })"
          @click="allerA(i)"
        >
          {{ i + 1 }}
          <!-- La marque est un CARACTÈRE, pas une teinte : elle survit au
               daltonisme comme au mode sombre. -->
          <span v-if="marquees.has(q.item_uuid)" class="grille__fanion" aria-hidden="true">★</span>
        </button>
      </nav>

      <p v-if="modeExamen" class="grille__legende">
        {{ t('simulation.grille_legende', { repondues, total, marquees: marqueesCount }) }}
      </p>

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

        <!-- Marquer n'enregistre RIEN côté serveur et ne remplace pas une
             réponse : c'est un repère de navigation, et le libellé le dit. -->
        <button
          v-if="modeExamen"
          type="button"
          class="btn btn--fantome"
          :aria-pressed="marquees.has(item.item_uuid)"
          @click="basculerMarque(item.item_uuid)"
        >
          {{ marquees.has(item.item_uuid) ? t('simulation.demarquer') : t('simulation.marquer') }}
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

/* Les cinq dernières minutes. La couleur SOULIGNE, elle ne dit pas : le
   bandeau `.derniere-ligne` porte le texte, et il reste lisible sans elle. */
/* `--sys-err-texte` et non `--sys-err` : le premier est le jeton de TEXTE,
   le second un aplat de fond et de bordure. Le contraste diffère, et c'est
   la règle SEP-04 du socle. La bordure ci-dessous, elle, prend bien l'aplat. */
.passation__temps--urgent .passation__temps-valeur { color: var(--sys-err-texte); }

.derniere-ligne {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--e-3);
  align-items: start;
  margin-block: var(--e-3) 0;
  padding: var(--e-3) var(--e-4);
  background: var(--surface-douce);
  border: 1px solid var(--sys-err);
  border-inline-start-width: 4px;
  border-radius: var(--r);
  font-size: var(--t-sm);
}

.derniere-ligne__marque { font-size: var(--t-lg); line-height: 1.3; }
.derniere-ligne strong { display: block; }

/* --- Grille de navigation (mode examen) --- */

.grille {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  margin-block: var(--e-4) var(--e-2);
}

.grille__case {
  position: relative;
  /* 44 px : cible tactile minimale, contrôlée par `auditer.mjs`. */
  min-inline-size: 44px;
  min-block-size: 44px;
  padding: var(--e-2);
  font-family: var(--mono);
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--texte);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  cursor: pointer;
}

.grille__case:hover { border-color: var(--bordure-forte); }

/* Répondue : le fond change ET le poids du trait. Deux signaux, pas un. */
.grille__case--repondue {
  background: var(--accent-doux);
  border-color: var(--accent);
}

/* La question courante porte un contour épais : repérable sans la couleur. */
.grille__case--courante {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.grille__case--marquee { border-style: dashed; border-width: 2px; }

.grille__fanion {
  position: absolute;
  inset-block-start: -2px;
  inset-inline-end: 2px;
  font-size: var(--t-xs);
  line-height: 1;
}

.grille__legende {
  margin-block: 0 var(--e-4);
  font-size: var(--t-xs);
  color: var(--texte-doux);
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
