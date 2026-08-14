<script setup lang="ts">
import type { RapportSimulation } from '~/composables/useSimulation'
import { ApiRequestError } from '~/composables/useApi'

/**
 * E11 — le rapport d'examen blanc.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA SEULE NOTE D'ÉPREUVE DU PRODUIT, ET ELLE S'APPELLE « NOTE BLANCHE »
 *
 * Partout ailleurs, un score se refuse à se présenter comme une note : une
 * série d'entraînement vise un point faible, un diagnostic est court, et
 * afficher « 90 % » après une révision ciblée ferait croire à un candidat
 * qu'il est prêt. C'est DET-31.
 *
 * Ici la note est légitime pour une raison STRUCTURELLE, et une seule : la
 * série a été composée selon les POIDS OFFICIELS des domaines de l'épreuve.
 * Elle reproduit l'épreuve, donc elle peut être notée comme l'épreuve. Le
 * serveur écrit ce raisonnement dans `meta.scoring_basis`, et cet écran le
 * MONTRE — il ne le paraphrase pas, il ne le résume pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CET ÉCRAN N'AFFICHERA JAMAIS
 *
 * Aucune prédiction de réussite, sous aucune forme — pas de « vous seriez
 * admis », pas de comparaison de la note au seuil, pas de projection. Le seuil
 * officiel est CITÉ quand le descriptif le donne, et rien n'est calculé
 * dessus : citer informe, comparer prédirait.
 *
 * Aucune note sur 20. Le barème n'est pas public ; le serveur sert la mention
 * d'absence, et l'écran l'affiche à côté de la note plutôt que de laisser le
 * candidat supposer qu'un pourcentage vaut une note.
 *
 * AUCUN CHIFFRE FABRIQUÉ : `weighted_percent` peut être nul — aucune section
 * pondérée servie. L'écran n'écrit alors rien. « 0 % » serait une affirmation
 * fausse ; l'absence ne dit rien.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { rapport } = useSimulation()

const uuid = computed(() => String(route.params.uuid ?? ''))

const donnees = ref<RapportSimulation | null>(null)
const erreur = ref<ApiRequestError | null>(null)

/* L'appel CLÔT la tentative si l'échéance est passée : c'est le chemin normal
 * d'un candidat qui revient après la fin du temps imparti. */
await rapport(uuid.value)
  .then((r) => { donnees.value = r })
  .catch((e: unknown) => {
    if (e instanceof ApiRequestError) erreur.value = e
    else throw e
  })

/** La tentative n'est pas terminée : R06 s'applique encore, aucun chiffre. */
const pasEncoreTerminee = computed(() => erreur.value?.error.code === 'ATTEMPT_NOT_SUBMITTED')

const note = computed(() => donnees.value?.score.weighted_percent ?? null)
const sections = computed(() => donnees.value?.sections ?? [])
const officiel = computed(() => donnees.value?.official ?? null)

/** Le chronomètre a tranché, ou le candidat a rendu ? Le candidat doit le savoir. */
const clotureParLeTemps = computed(() => donnees.value?.status === 'expired')

/** Couverture partielle du barème : une section pondérée n'a pas été servie. */
const couvertureIncomplete = computed(() => {
  const c = donnees.value?.score.weight_covered
  return c !== undefined && c > 0 && c < 100
})

useHead({ title: () => t('simulation.rapport_titre') })
</script>

<template>
  <div class="enveloppe">
    <div v-if="pasEncoreTerminee" class="alerte alerte--info" role="status">
      <span>{{ t('simulation.rapport_pas_termine') }}</span>
    </div>

    <div v-else-if="erreur" class="alerte alerte--systeme" role="alert">
      <div>
        <span dir="auto">{{ erreur.message }}</span>
        <span v-if="erreur.error.request_id" class="alerte__reference">
          {{ t('errors.reference') }} {{ erreur.error.request_id }}
        </span>
      </div>
    </div>

    <template v-else-if="donnees">
      <p class="oeil">{{ t('simulation.oeil') }}</p>
      <h1 class="titre">{{ t('simulation.rapport_titre') }}</h1>
      <p v-if="donnees.exam" class="epreuve" dir="auto">{{ donnees.exam.name }}</p>

      <!-- Clos par le chronomètre : dit AVANT la note. Une note obtenue sur une
           épreuve interrompue ne se lit pas comme une note rendue. -->
      <p v-if="clotureParLeTemps" class="alerte alerte--info" role="status">
        {{ t('simulation.rapport_expire') }}
      </p>

      <!-- ─────────────────── LA NOTE BLANCHE ─────────────────── -->
      <section class="note">
        <p class="note__etiquette">{{ t('simulation.note_blanche') }}</p>

        <p v-if="note !== null" class="note__valeur">
          {{ t('simulation.pourcent', { n: note }) }}
        </p>
        <!-- Aucune section pondérée servie : on n'écrit rien. « 0 % » mentirait. -->
        <p v-else class="note__absente">{{ t('simulation.note_indisponible') }}</p>

        <p class="note__brut">
          {{ t('simulation.brut', {
            correct: donnees.raw.correct,
            asked: donnees.raw.asked,
          }) }}
        </p>

        <!-- Le raisonnement vient du SERVEUR, servi tel quel. -->
        <p class="note__base" dir="auto">{{ donnees.meta.scoring_basis }}</p>
        <p class="note__bareme" dir="auto">{{ donnees.meta.not_official_scale }}</p>

        <p v-if="couvertureIncomplete" class="note__couverture">
          {{ t('simulation.couverture_partielle', { n: donnees.score.weight_covered }) }}
        </p>
      </section>

      <!-- ─────────────────── LE DÉTAIL PAR SECTION ─────────────────── -->
      <section class="bloc">
        <h2 class="bloc__titre">{{ t('simulation.sections_titre') }}</h2>

        <ul class="sections">
          <li v-for="section in sections" :key="section.code ?? ''" class="section">
            <div class="section__entete">
              <span class="section__nom" dir="auto">{{ section.name }}</span>
              <span v-if="section.weight_percent !== null" class="section__poids">
                {{ t('simulation.poids_de', { n: section.weight_percent }) }}
              </span>
            </div>

            <!-- Le score PORTE SON VOLUME D'ÉVIDENCE : « 1 sur 2 » et non
                 « 50 % » seul. Un 100 % sur deux questions n'est pas une
                 section maîtrisée, et le candidat doit pouvoir le voir. -->
            <p class="section__mesure">
              {{ t('simulation.section_resultat', {
                correct: section.correct,
                asked: section.asked,
              }) }}
            </p>

            <span class="section__jauge" aria-hidden="true">
              <span
                class="section__remplissage"
                :style="{ inlineSize: `${Math.round((section.rate ?? 0) * 100)}%` }"
              />
            </span>
          </li>
        </ul>
      </section>

      <!-- ─────────────────── CE QUE DIT LE DESCRIPTIF ─────────────────── -->
      <section v-if="officiel" class="bloc bloc--officiel">
        <h2 class="bloc__titre">{{ t('simulation.officiel_titre') }}</h2>

        <!-- CITATIONS, servies telles quelles. Rien n'est calculé dessus : le
             seuil informe, il n'est jamais comparé à la note du candidat. -->
        <p v-if="officiel.scoring_note" class="officiel__ligne" dir="auto">
          {{ officiel.scoring_note }}
        </p>
        <p v-if="officiel.admission_threshold_note" class="officiel__ligne" dir="auto">
          {{ officiel.admission_threshold_note }}
        </p>
        <p v-if="officiel.question_count === null" class="officiel__ligne officiel__ligne--absent">
          {{ t('simulation.nombre_non_officiel') }}
        </p>
      </section>

      <p class="disclaimer" dir="auto">{{ donnees.meta.disclaimer }}</p>

      <!-- ─────────────────── ET MAINTENANT ─────────────────── -->
      <div class="suites">
        <NuxtLink
          v-if="donnees.exam"
          class="btn"
          :to="localePath(`/app/ordonnance/${donnees.exam.code}`)"
        >
          {{ t('simulation.vers_ordonnance') }}
        </NuxtLink>

        <NuxtLink
          v-if="donnees.exam"
          class="btn btn--fantome"
          :to="localePath(`/app/entrainement/${donnees.exam.code}`)"
        >
          {{ t('simulation.vers_entrainement') }}
        </NuxtLink>

        <NuxtLink class="btn btn--fantome" :to="localePath(`/app/tentative/${uuid}/correction`)">
          {{ t('simulation.vers_correction') }}
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.oeil {
  margin: 0 0 var(--e-1);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--texte-doux);
}

.titre { margin-block: 0 var(--e-2); font-size: var(--t-2xl); font-weight: 800; }
.epreuve { margin-block: 0 var(--e-4); font-size: var(--t-lg); color: var(--texte-doux); }

.note {
  margin-block-end: var(--e-5);
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure-forte);
  border-radius: var(--r-m);
}

.note__etiquette {
  margin: 0 0 var(--e-1);
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--texte-doux);
}

.note__valeur {
  margin: 0;
  font-family: var(--mono);
  font-size: var(--t-3xl, var(--t-2xl));
  font-weight: 800;
  line-height: 1.1;
}

.note__absente { margin: 0; font-size: var(--t-sm); color: var(--texte-doux); }

.note__brut { margin-block: var(--e-1) var(--e-4); font-size: var(--t-sm); color: var(--texte-doux); }

.note__base,
.note__bareme,
.note__couverture {
  margin-block: 0 var(--e-2);
  font-size: var(--t-sm);
  line-height: 1.55;
  color: var(--texte-doux);
}

.note__bareme { font-weight: 600; }

.bloc {
  margin-block-end: var(--e-5);
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r-m);
}

.bloc__titre { margin-block: 0 var(--e-4); font-size: var(--t-lg); font-weight: 700; }

.sections { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--e-4); }

.section__entete {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  justify-content: space-between;
  align-items: baseline;
}

.section__nom { font-weight: 700; font-size: var(--t-sm); }
.section__poids { font-size: var(--t-xs); font-family: var(--mono); color: var(--texte-doux); }

.section__mesure { margin-block: var(--e-1); font-size: var(--t-sm); color: var(--texte-doux); }

.section__jauge {
  display: block;
  block-size: 6px;
  border-radius: 999px;
  background: var(--surface-douce);
  overflow: hidden;
}

.section__remplissage { display: block; block-size: 100%; background: var(--accent); }

.bloc--officiel { background: var(--surface-douce); }

.officiel__ligne { margin-block: 0 var(--e-2); font-size: var(--t-sm); line-height: 1.55; }
.officiel__ligne--absent { color: var(--texte-doux); }

.disclaimer {
  margin-block: 0 var(--e-5);
  padding: var(--e-3) var(--e-4);
  font-size: var(--t-sm);
  line-height: 1.55;
  border-inline-start: 3px solid var(--bordure-forte);
  color: var(--texte-doux);
}

.suites { display: flex; flex-wrap: wrap; gap: var(--e-3); }
</style>
