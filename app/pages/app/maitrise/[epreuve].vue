<script setup lang="ts">
/**
 * E5 — maîtrise par domaine.
 *
 * LA RÈGLE QUI GOUVERNE CET ÉCRAN
 *
 * Un score ne s'affiche jamais seul, et `null` n'est pas zéro.
 *
 * `null` veut dire « pas encore assez de réponses pour conclure ». L'afficher
 * comme 0 % dirait à un candidat qu'il a échoué à ce qu'il n'a pas passé — une
 * affirmation fausse sur sa personne, pas un arrondi de présentation. Il n'y a
 * donc AUCUN `?? 0` dans ce fichier, et aucune barre vide qui se lirait comme
 * une note nulle : quand le score manque, c'est une phrase qui prend sa place.
 *
 * Et chaque score affiché l'est avec ce qui le fonde : évidence, réponses
 * données, réponses manquantes.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const { t } = useI18n()
const { maitrise, sansConclusion, jamaisEvalue } = useMaitrise()

const code = computed(() => String(route.params.epreuve ?? ''))
const { data } = await maitrise(code)

const domaines = computed(() => data.value?.data ?? [])

useHead({ title: t('maitrise.titre') })
</script>

<template>
  <div class="enveloppe">
    <p class="oeil">{{ t('maitrise.oeil') }}</p>
    <h1 class="titre-page">{{ t('maitrise.titre') }}</h1>
    <GuideEcran cle="maitrise" />
    <p class="chapeau">{{ t('maitrise.intro') }}</p>

    <p v-if="!domaines.length" class="alerte alerte--info" role="status">
      <span>{{ t('maitrise.aucun') }}</span>
    </p>

    <ul v-else class="domaines">
      <li v-for="d in domaines" :key="d.node_uuid" class="domaine" :data-conclu="!sansConclusion(d)">
        <div class="domaine__entete">
          <h2 class="domaine__nom" dir="auto">{{ d.node_name }}</h2>
          <span v-if="d.weight_percent !== null" class="domaine__poids">
            {{ t('ordonnance.poids') }} {{ d.weight_percent }}&#8239;%
          </span>
        </div>

        <!-- Score présent : le nombre ET la jauge, tous deux étiquetés. -->
        <template v-if="!sansConclusion(d)">
          <p class="domaine__score">{{ d.score }}&#8239;%</p>
          <div
            class="domaine__jauge"
            role="img"
            :aria-label="`${d.score}%`"
          >
            <span class="domaine__jauge-part" :style="{ inlineSize: `${d.score}%` }" />
          </div>
        </template>

        <!-- Score absent : une PHRASE, jamais un zéro ni une jauge vide. Une
             barre à zéro se lit comme une note, et c'est exactement le
             contresens que la règle interdit. -->
        <p v-else class="domaine__sans-conclusion">
          {{ jamaisEvalue(d) ? t('maitrise.jamais_evalue') : t('maitrise.non_conclu') }}
          <!-- « Pas de score » se lit spontanément comme « zéro ». Le repère
               dit la différence, à l'endroit exact où la confusion naît. -->
          <AideBulle :sujet="t('maitrise.titre')" :texte="t('aide.score_absent')" />
        </p>

        <!-- Ce qui fonde le score, systématiquement — y compris quand il n'y
             en a pas, où c'est ce qui manque qui est dit. -->
        <ul class="domaine__assise">
          <li>{{ t('maitrise.fonde_sur', { n: d.answered_count }) }}</li>
          <li v-if="d.answers_missing > 0">{{ t('maitrise.manquantes', { n: d.answers_missing }) }}</li>
          <li v-if="d.skipped_count > 0">{{ t('maitrise.sautees', { n: d.skipped_count }) }}</li>
          <li v-if="d.confident_errors > 0">{{ t('maitrise.erreurs_certitude', { n: d.confident_errors }) }}</li>
          <li v-if="d.lucky_guesses > 0">{{ t('maitrise.hasard', { n: d.lucky_guesses }) }}</li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.domaines { display: grid; gap: var(--e-3); margin: 0; padding: 0; list-style: none; }

.domaine {
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

/* Un domaine sans conclusion se distingue par sa BORDURE et par sa phrase,
   jamais par la seule couleur d'un chiffre absent. */
.domaine[data-conclu='false'] { border-inline-start: 3px solid var(--bordure-forte); }

.domaine__entete {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  align-items: baseline;
  justify-content: space-between;
}

.domaine__nom { margin: 0; font-size: var(--t-md); font-weight: 700; }
.domaine__poids { font-size: var(--t-xs); color: var(--texte-doux); }

.domaine__score {
  margin: var(--e-2) 0 var(--e-2);
  font-size: var(--t-2xl);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.domaine__jauge {
  block-size: 8px;
  margin-block-end: var(--e-3);
  background: var(--surface-douce);
  border-radius: 999px;
  overflow: hidden;
}

.domaine__jauge-part {
  display: block;
  block-size: 100%;
  background: var(--accent);
}

.domaine__sans-conclusion {
  margin: var(--e-2) 0 var(--e-3);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--texte-doux);
}

.domaine__assise {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-1) var(--e-4);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--t-xs);
  color: var(--texte-doux);
}
</style>
