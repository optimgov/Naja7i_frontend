<script setup lang="ts">
/**
 * Une épreuve avec son coefficient et ses domaines officiels.
 *
 * Correction du PAS-4.1 portée à l'écran : ce ne sont pas trois « piliers »
 * d'un même examen mais trois ÉPREUVES distinctes, de coefficients 8, 12 et
 * 20. La maquette v1 laissait croire l'inverse, et un candidat aurait organisé
 * ses révisions sur de mauvaises proportions.
 *
 * D-01 — ET ELLE PORTE LA PORTE. Aucune fiche du catalogue ne menait au seuil
 * du diagnostic : ni la famille, ni la spécialité. La recette humaine du
 * 17 août n'y est arrivée qu'en tapant l'adresse. Une carte qui décrit une
 * épreuve en détail sans dire par où on la commence est un écran qui mesure
 * sans offrir la porte qui le remplit.
 *
 * Le lien mène au SEUIL, pas au lancement : l'écran E2 dit ce qui est mesuré et
 * ce qui ne l'est pas avant qu'une seule question soit tirée. Il est sous
 * `middleware: 'auth'` — un visiteur non connecté est conduit à la connexion,
 * ce qui est la vérité de ce chemin, pas un cul-de-sac.
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
const localePath = useLocalePath()
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

    <p class="epreuve__acte">
      <NuxtLink class="lien-second epreuve__porte" :to="localePath(`/app/diagnostic/${code}`)">
        {{ t('catalogue.commencer_diagnostic') }}
      </NuxtLink>
    </p>
  </article>
</template>

<style scoped>
.epreuve {
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  padding: var(--e-4);
}
.epreuve__coef { display: flex; align-items: baseline; gap: 6px; margin-block-end: var(--e-2); }
.epreuve__coef b { font-size: var(--t-2xl); font-weight: 800; color: var(--accent); letter-spacing: -.04em; }
.epreuve__coef span { font-size: var(--t-xs); font-weight: 700; color: var(--texte-doux); text-transform: uppercase; letter-spacing: .07em; }
.epreuve__titre { font-size: var(--t-md); margin-block-end: var(--e-2); }
.epreuve__meta { display: flex; gap: 6px; font-size: var(--t-xs); color: var(--texte-doux); margin-block-end: var(--e-3); }

.domaine { display: grid; gap: 3px; margin-block-end: var(--e-2); }
.domaine__ligne { display: flex; justify-content: space-between; gap: 10px; font-size: var(--t-sm); }
.domaine__ligne b { font-weight: 700; font-family: var(--mono); font-size: var(--t-xs); }

/* Contraste mesuré : vert-700 sur sable-200 = 6,45:1.
   La v2 employait vert-500 sur sable-100, à 2,84:1 — sous le seuil WCAG de
   3:1 applicable aux objets graphiques porteurs d'information. */
.jauge { block-size: 6px; background: var(--bordure); border-radius: 99px; overflow: hidden; }
.jauge span { display: block; block-size: 100%; background: var(--vert-700); border-radius: 99px; }

.epreuve__acte { margin-block-start: var(--e-3); }

/* 44 px de cible tactile, comme toutes les portes de ce lot. */
.epreuve__porte { display: inline-flex; align-items: center; min-block-size: 44px; font-size: var(--t-sm); }
</style>
