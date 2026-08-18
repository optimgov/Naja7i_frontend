<script setup lang="ts">
/**
 * E6 — l'ordonnance complète.
 *
 * DEUX RÈGLES, TENUES ICI
 *
 * Aucune prédiction : `meta.disclaimer` vient du serveur et s'affiche tel quel.
 * Il n'est jamais réécrit, et il n'existe aucun repli en dur — si le serveur
 * cesse de le servir, il disparaît de l'écran plutôt que d'être imité. C'est la
 * même discipline que la mention d'exemple du bloc de démonstration : une
 * interface qui réécrit la clause qui l'engage la vide de son sens.
 *
 * Un domaine jamais évalué est un ANGLE MORT à découvrir, pas une lacune
 * démontrée. La distinction est portée par le motif servi par le serveur —
 * l'interface la lit, elle ne la devine pas.
 *
 * ─────────────────────────── D-06 — LA PORTE MANQUANTE ──────────────────────
 *
 * Cet écran est resté DIX-SEPT JOURS sans un seul élément cliquable dans son
 * corps. Le commit `dcac779` du 11 août s'intitulait pourtant « l'entraînement
 * ciblé, l'ordonnance devient cliquable » : le configurateur E7 a bien été
 * écrit, le tableau de bord y mène — et l'ordonnance, jamais. La promesse était
 * dans le titre du commit, pas dans le gabarit.
 *
 * Chaque ligne mène maintenant au configurateur AVEC SON DOMAINE PRÉSÉLECTIONNÉ.
 * Pas un `POST` direct depuis ici : le serveur refuse un périmètre vide ou trop
 * mince (`TRAINING_SCOPE_EMPTY`, `TRAINING_SCOPE_TOO_NARROW`), et E7 sait déjà
 * dire ces deux refus avec les chiffres du serveur. Lancer d'ici rendrait ces
 * refus muets ou les ferait ressembler à une panne.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { ordonnance, estAngleMort } = useOrdonnance()
const { sansConclusion } = useMaitrise()

const code = computed(() => String(route.params.epreuve ?? ''))
const { data } = await ordonnance(code, 20)

const lignes = computed(() => data.value?.data ?? [])
const disclaimer = computed(() => data.value?.meta?.disclaimer ?? null)

useHead({ title: t('ordonnance.titre') })
</script>

<template>
  <div class="enveloppe">
    <p class="oeil">{{ t('maitrise.oeil') }}</p>
    <h1 class="titre-page">{{ t('ordonnance.titre') }}</h1>

    <!-- Servi par le serveur, affiché sans retouche. Aucun repli en dur. -->
    <p v-if="disclaimer" class="disclaimer" dir="auto">{{ disclaimer }}</p>

    <!-- Aucune ligne : l'ordonnance se nourrit des réponses, et il n'y en a pas
         encore. On le dit, et on offre le geste qui la remplit. -->
    <div v-if="!lignes.length" class="alerte alerte--info vide" role="status">
      <span>{{ t('ordonnance.vide') }}</span>
      <NuxtLink class="lien-second" :to="localePath(`/app/diagnostic/${code}`)">
        {{ t('diagnostic.lancer') }}
      </NuxtLink>
    </div>

    <ol v-else class="plan">
      <li
        v-for="(ligne, rang) in lignes"
        :key="ligne.node_uuid"
        class="plan__ligne"
        :data-angle-mort="estAngleMort(ligne)"
      >
        <span class="plan__rang" aria-hidden="true">{{ rang + 1 }}</span>

        <div class="plan__corps">
          <div class="plan__entete">
            <h2 class="plan__domaine" dir="auto">{{ ligne.node_name }}</h2>
            <span v-if="ligne.weight_percent !== null" class="plan__poids">
              {{ t('ordonnance.poids') }} {{ ligne.weight_percent }}&#8239;%
            </span>
          </div>

          <!-- Le motif est l'explication : aucun résultat affiché sans elle. -->
          <p class="plan__motif">{{ t(`ordonnance.motif_${ligne.reason}`) }}</p>

          <!-- Le score n'apparaît QUE s'il conclut ; sinon c'est ce qui manque
               qui est dit. Jamais 0 %, jamais une jauge vide. -->
          <p class="plan__assise">
            <template v-if="!sansConclusion(ligne)">
              <span class="plan__score">{{ ligne.score }}&#8239;%</span>
            </template>
            <span v-else class="plan__sans-score">
              {{ estAngleMort(ligne) ? t('maitrise.jamais_evalue') : t('maitrise.non_conclu') }}
            </span>

            <span>{{ t('maitrise.fonde_sur', { n: ligne.answered_count }) }}</span>
            <span v-if="ligne.answers_missing > 0">
              {{ t('maitrise.manquantes', { n: ligne.answers_missing }) }}
            </span>
            <span v-if="ligne.skipped_count > 0">
              {{ t('maitrise.sautees', { n: ligne.skipped_count }) }}
            </span>
            <span v-if="ligne.confident_errors > 0">
              {{ t('maitrise.erreurs_certitude', { n: ligne.confident_errors }) }}
            </span>
            <span v-if="ligne.lucky_guesses > 0">
              {{ t('maitrise.hasard', { n: ligne.lucky_guesses }) }}
            </span>
          </p>

          <p v-if="ligne.remediation" class="plan__remede">
            <span class="plan__remede-libelle">{{ t('correction.remediation') }}</span>
            <span dir="auto">{{ ligne.remediation.title }}</span>
            <span v-if="ligne.remediation.estimated_minutes" class="plan__duree">
              {{ t('correction.minutes', { n: ligne.remediation.estimated_minutes }) }}
            </span>
          </p>

          <!-- LA PORTE DE LA LIGNE. Un vrai lien, dans le corps de la page :
               c'est exactement ce que le DOM ne contenait pas. Le domaine
               voyage dans l'URL — le configurateur est atteignable par son
               adresse, et un état partagé ne survivrait pas au rechargement. -->
          <p class="plan__actes">
            <NuxtLink
              class="lien-second plan__travailler"
              :to="localePath(`/app/entrainement/${code}?domaine=${ligne.node_uuid}`)"
            >
              {{ estAngleMort(ligne) ? t('ordonnance.decouvrir') : t('ordonnance.travailler') }}
            </NuxtLink>
          </p>
        </div>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.disclaimer {
  max-inline-size: 66ch;
  margin-block: 0 var(--e-5);
  padding: var(--e-3) var(--e-4);
  font-size: var(--t-sm);
  color: var(--texte);
  background: var(--surface-douce);
  border-inline-start: 3px solid var(--bordure-forte);
  border-radius: var(--r);
}

.vide { display: flex; flex-wrap: wrap; gap: var(--e-2) var(--e-4); align-items: baseline; }

.plan { display: grid; gap: var(--e-3); margin: 0; padding: 0; list-style: none; }

.plan__ligne {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--e-3);
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-inline-start: 3px solid var(--accent);
  border-radius: var(--r);
}

/* Un angle mort ne se présente pas comme une faiblesse : trait discret,
   et le motif le dit en toutes lettres juste à côté. */
.plan__ligne[data-angle-mort='true'] { border-inline-start-color: var(--bordure-forte); }

.plan__rang {
  inline-size: 26px;
  block-size: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--surface-douce);
  font-size: var(--t-xs);
  font-weight: 800;
  color: var(--texte-doux);
}

.plan__entete {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  align-items: baseline;
  justify-content: space-between;
}

.plan__domaine { margin: 0; font-size: var(--t-md); font-weight: 700; }
.plan__poids { font-size: var(--t-xs); color: var(--texte-doux); }

.plan__motif { margin: var(--e-2) 0; font-size: var(--t-sm); color: var(--texte); }

.plan__assise {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-1) var(--e-4);
  margin: 0;
  font-size: var(--t-xs);
  color: var(--texte-doux);
}

.plan__score { font-size: var(--t-sm); font-weight: 800; color: var(--texte); }
.plan__sans-score { font-weight: 600; }

.plan__remede {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  align-items: baseline;
  margin: var(--e-3) 0 0;
  font-size: var(--t-sm);
  color: var(--peda-remede-texte);
}

.plan__remede-libelle { font-weight: 700; }
.plan__duree { font-size: var(--t-xs); color: var(--texte-doux); }

.plan__actes { margin: var(--e-3) 0 0; }

/* 44 px de cible tactile — une porte se prend au doigt. La couleur vient de
   `.lien-second`, donc de `--lien` : ici, l'apparence de lien EST tenue. */
.plan__travailler {
  display: inline-flex;
  align-items: center;
  min-block-size: 44px;
  font-size: var(--t-sm);
}
</style>
