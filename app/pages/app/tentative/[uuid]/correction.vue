<script setup lang="ts">
/**
 * E4 — la correction. L'écran qui justifie le lot.
 *
 * Il porte DEUX fiches ensemble, et la distinction n'est pas cosmétique :
 *
 *  - `rationale` — pourquoi cette option est fausse. Contenu éditorial de la
 *    question, toujours servi, jamais conditionné.
 *  - `cause` — pourquoi le candidat a probablement choisi celle-là (F03, F04).
 *    Soumise au quota, et HYPOTHÈSE par nature.
 *
 * La mention « hypothèse » ne vient pas de la rédaction : elle est ajoutée par
 * `.autopsie__hypothese::after` dans `commun.css`. Ainsi aucun contenu futur ne
 * peut présenter une cause comme un verdict, quel que soit le texte servi.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { correction } = useCorrection()
const { charger, tentative } = useTentative()

const uuid = computed(() => String(route.params.uuid ?? ''))

const { data } = await correction(uuid)

/*
 * RÈGLE 9bis — `attempt.kind` avant tout score.
 *
 * `meta` de la correction ne porte pas le genre de la série : il faut la
 * tentative. Un résultat d'ENTRAÎNEMENT n'est pas représentatif du concours,
 * par construction — la série est composée à la demande, pas pondérée par les
 * poids officiels. Il ne se présente donc jamais comme une note d'épreuve, et
 * l'écran le dit avant de montrer le nombre.
 */
await charger(uuid.value).catch(() => {})

const genre = computed(() => tentative.value?.kind ?? null)
const estDiagnostic = computed(() => genre.value === 'diagnostic')
const estEntrainement = computed(() => genre.value !== null && genre.value !== 'diagnostic')

const meta = computed(() => data.value?.meta ?? null)
const lignes = computed(() => data.value?.data ?? [])
const quota = computed(() => meta.value?.cause_quota ?? null)

function optionChoisie(ligne: (typeof lignes.value)[number]) {
  return ligne.options.find((o) => o.uuid === ligne.answer.selected_option_uuid) ?? null
}

useHead({ title: t('correction.titre') })
</script>

<template>
  <div class="enveloppe">
    <p class="oeil">{{ t('correction.oeil') }}</p>
    <h1 class="titre-page">{{ t('correction.titre') }}</h1>

    <!-- Règle 9bis : le cadrage AVANT le nombre. Un résultat d'entraînement
         annoncé après coup a déjà été lu comme une note. -->
    <p v-if="estEntrainement" class="alerte alerte--info" role="note">
      <span>{{ t('correction.entrainement_avertissement') }}</span>
    </p>

    <p v-if="meta" class="resultat">
      {{ t('correction.resultat', { n: meta.correct_count, total: meta.item_count }) }}
    </p>

    <!-- Quota épuisé : dit UNE fois, en tête, plutôt qu'à chaque ligne fermée.
         La justification, elle, reste partout. -->
    <div v-if="quota && !quota.unlimited && quota.revealed >= quota.quota" class="mur">
      <p class="mur__titre">{{ t('correction.cause_fermee_titre') }}</p>
      <p class="mur__texte">
        {{ t('correction.cause_fermee_texte', { revealed: quota.revealed, quota: quota.quota }) }}
      </p>
    </div>

    <ol class="lignes">
      <li v-for="ligne in lignes" :key="ligne.item_uuid" class="ligne">
        <p class="ligne__competence" dir="auto">{{ ligne.competency.name }}</p>
        <h2 class="ligne__enonce" dir="auto">{{ ligne.question.stem }}</h2>

        <p class="ligne__verdict" :data-juste="ligne.answer.is_correct">
          <span class="ligne__signe" aria-hidden="true">{{ ligne.answer.is_correct ? '✓' : '✕' }}</span>
          <span v-if="!ligne.answer.selected_option_uuid">{{ t('correction.non_repondue') }}</span>
          <span v-else>
            {{ t('correction.votre_reponse') }} —
            <span dir="auto">{{ optionChoisie(ligne)?.content }}</span>
          </span>
          <span v-if="ligne.answer.confidence" class="ligne__certitude">
            {{ t('correction.certitude') }} :
            {{ t(`correction.certitude_${ligne.answer.confidence}`) }}
          </span>
        </p>

        <ul class="options">
          <li
            v-for="option in ligne.options"
            :key="option.uuid"
            class="opt"
            :class="{
              'opt--juste': option.is_correct,
              'opt--choisie': option.uuid === ligne.answer.selected_option_uuid,
            }"
          >
            <p class="opt__contenu" dir="auto">
              <span class="opt__signe" aria-hidden="true">{{ option.is_correct ? '✓' : '✕' }}</span>
              {{ option.content }}
              <span class="lecture-seule">
                {{ option.is_correct ? t('correction.bonne_reponse') : t('correction.pourquoi_faux') }}
              </span>
            </p>

            <!-- Toujours servie, jamais conditionnée par le quota. -->
            <p v-if="option.rationale" class="justification" dir="auto">{{ option.rationale }}</p>

            <!-- Hypothèse, et c'est le CSS qui le dit. -->
            <p v-if="option.cause" class="autopsie">
              <span class="autopsie__hypothese">
                {{ t('correction.autopsie') }} : {{ t(`causes.${option.cause}`) }}
              </span>
            </p>
          </li>
        </ul>

        <p v-if="ligne.question.explanation" class="justification justification--globale" dir="auto">
          {{ ligne.question.explanation }}
        </p>

        <!-- Cause fermée sur CETTE ligne : un champ, pas un bouton désactivé
             ni un lien masqué. L'invitation prend la place de la cause. -->
        <p v-if="ligne.cause_locked" class="cause-fermee">
          {{ t('correction.cause_fermee_titre') }}
        </p>

        <p v-if="ligne.remediation" class="remede">
          <span class="remede__libelle">{{ t('correction.remediation') }}</span>
          <span dir="auto">{{ ligne.remediation.title }}</span>
          <span v-if="ligne.remediation.estimated_minutes" class="remede__duree">
            {{ t('correction.minutes', { n: ligne.remediation.estimated_minutes }) }}
          </span>
        </p>
      </li>
    </ol>

    <div v-if="tentative" class="suites">
      <NuxtLink class="btn" :to="localePath(`/app/maitrise/${tentative.exam.code}`)">
        {{ t('correction.voir_maitrise') }}
      </NuxtLink>
      <NuxtLink class="lien-second" :to="localePath(`/app/ordonnance/${tentative.exam.code}`)">
        {{ t('correction.voir_ordonnance') }}
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.resultat {
  margin-block: 0 var(--e-5);
  font-size: var(--t-xl);
  font-weight: 800;
}

.mur {
  margin-block-end: var(--e-5);
  padding: var(--e-4);
  background: var(--peda-remede-fond);
  border: 1px solid var(--peda-remede-bordure);
  border-radius: var(--r);
}

.mur__titre { margin: 0 0 var(--e-2); font-weight: 700; color: var(--peda-remede-texte); }
.mur__texte { margin: 0; font-size: var(--t-sm); color: var(--texte-doux); }

.lignes { display: grid; gap: var(--e-5); margin: 0; padding: 0; list-style: none; }

.ligne {
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.ligne__competence {
  margin: 0 0 var(--e-2);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--texte-doux);
}

.ligne__enonce { margin: 0 0 var(--e-3); font-size: var(--t-lg); font-weight: 700; line-height: 1.45; }

/* Le verdict porte un SIGNE et des MOTS, pas seulement une couleur : sous
   deutéranopie, juste et faux sont à ΔE 4,7 (1,7 en sombre). */
.ligne__verdict {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  align-items: baseline;
  margin: 0 0 var(--e-4);
  padding: var(--e-3);
  border-radius: var(--r);
  font-size: var(--t-sm);
}

.ligne__verdict[data-juste='true'] {
  color: var(--peda-juste-texte);
  background: var(--peda-juste-fond);
}

.ligne__verdict[data-juste='false'] {
  color: var(--peda-faux-texte);
  background: var(--peda-faux-fond);
}

.ligne__signe { font-weight: 800; }
.ligne__certitude { color: var(--texte-doux); }

.options { display: grid; gap: var(--e-2); margin: 0 0 var(--e-3); padding: 0; list-style: none; }

.opt {
  padding: var(--e-3);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.opt--juste { border-color: var(--peda-juste); background: var(--peda-juste-fond); }
.opt--choisie { border-inline-start: 3px solid var(--peda-faux); }
.opt--juste.opt--choisie { border-inline-start-color: var(--peda-juste); }

.opt__contenu { margin: 0; font-weight: 600; }
.opt__signe { font-weight: 800; margin-inline-end: var(--e-1); }

.remede {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  align-items: baseline;
  margin: var(--e-3) 0 0;
  font-size: var(--t-sm);
  color: var(--peda-remede-texte);
}

.remede__libelle { font-weight: 700; }
.remede__duree { color: var(--texte-doux); font-size: var(--t-xs); }

.cause-fermee {
  margin: var(--e-3) 0 0;
  padding: var(--e-3);
  font-size: var(--t-sm);
  color: var(--peda-remede-texte);
  background: var(--peda-remede-fond);
  border-radius: var(--r);
}

.suites { display: flex; flex-wrap: wrap; gap: var(--e-4); align-items: center; margin-block-start: var(--e-6); }
</style>
