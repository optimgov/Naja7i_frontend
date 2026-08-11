<script setup lang="ts">
/**
 * Une épreuve avec son coefficient et ses domaines officiels.
 *
 * Correction du PAS-4.1 portée à l'écran : ce ne sont pas trois « piliers »
 * d'un même examen mais trois ÉPREUVES distinctes, de coefficients 8, 12 et
 * 20. La maquette v1 laissait croire l'inverse, et un candidat aurait organisé
 * ses révisions sur de mauvaises proportions.
 */
defineProps<{
  code: string
  nom: string
  coefficient: number | null
  duree: number | null
  langues: string[] | null
  domaines: Array<{ code: string; name: string; weight_percent: number | null }>
}>()

const { t } = useI18n()
</script>

<template>
  <article class="epreuve">
    <p class="epreuve__coef">
      <b>{{ coefficient ?? '—' }}</b>
      <span>{{ t('catalogue.coefficient') }}</span>
    </p>
    <h3 class="epreuve__titre" dir="auto">{{ nom }}</h3>
    <p class="epreuve__meta">
      <span v-if="duree">{{ t('catalogue.duree_minutes', { n: duree }) }}</span>
      <span v-if="langues?.length">· {{ langues.join(' / ') }}</span>
    </p>

    <div v-for="domaine in domaines" :key="domaine.code" class="domaine">
      <span class="domaine__ligne">
        <span dir="auto">{{ domaine.name }}</span>
        <b>{{ domaine.weight_percent }} %</b>
      </span>
      <span class="jauge">
        <span :style="{ inlineSize: `${domaine.weight_percent ?? 0}%` }" />
      </span>
    </div>
  </article>
</template>

<style scoped>
.epreuve {
  background: var(--sable-0);
  border: 1px solid var(--sable-200);
  border-radius: var(--r);
  padding: var(--e-4);
}
.epreuve__coef { display: flex; align-items: baseline; gap: 6px; margin-block-end: var(--e-2); }
.epreuve__coef b { font-size: var(--t-2xl); font-weight: 800; color: var(--vert-700); letter-spacing: -.04em; }
.epreuve__coef span { font-size: var(--t-xs); font-weight: 700; color: var(--texte-doux); text-transform: uppercase; letter-spacing: .07em; }
.epreuve__titre { font-size: var(--t-md); margin-block-end: var(--e-2); }
.epreuve__meta { display: flex; gap: 6px; font-size: var(--t-xs); color: var(--texte-doux); margin-block-end: var(--e-3); }

.domaine { display: grid; gap: 3px; margin-block-end: var(--e-2); }
.domaine__ligne { display: flex; justify-content: space-between; gap: 10px; font-size: var(--t-sm); }
.domaine__ligne b { font-weight: 700; font-family: var(--mono); font-size: var(--t-xs); }

/* Contraste mesuré : vert-700 sur sable-200 = 6,45:1.
   La v2 employait vert-500 sur sable-100, à 2,84:1 — sous le seuil WCAG de
   3:1 applicable aux objets graphiques porteurs d'information. */
.jauge { block-size: 6px; background: var(--sable-200); border-radius: 99px; overflow: hidden; }
.jauge span { display: block; block-size: 100%; background: var(--vert-700); border-radius: 99px; }
</style>
