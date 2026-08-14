<script setup lang="ts">
import type { Annonce } from '~/composables/useOpportunites'

/**
 * Le tapis — toutes les opportunités, trois vues.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES FILTRES VIVENT DANS L'URL, ET C'EST LA DÉCISION STRUCTURANTE
 *
 * `?filiere=education&sous=7j` n'est pas un confort : sans elle, rien n'est
 * partageable et rien n'est indexable. Un candidat qui envoie « les concours
 * d'éducation qui ferment cette semaine » à un ami doit envoyer une ADRESSE,
 * pas une suite de clics. Et un moteur qui ne voit qu'une page unique
 * n'indexe qu'une page — or la zone publique EST le levier d'acquisition.
 *
 * L'état de l'écran est donc DÉRIVÉ de la route, jamais dupliqué à côté :
 * un second état local aurait divergé au premier retour arrière du navigateur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS VUES, ET « PAR ÉCHÉANCE » EST LE DÉFAUT
 *
 * L'urgence est un PALIER NOMMÉ — « Clôture sous 7 jours » — et non une nuance
 * de couleur. C'est la même règle que sur la carte : le libellé écrit porte
 * l'information, le reste ne fait que la redoubler.
 */
definePageMeta({ layout: 'public' })

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()

const { annonces } = useOpportunites()
const { data: charge, error: erreurCharge } = await annonces()

/* Illisible → aucune donnée. On n'affiche pas « 0 annonce », qui serait faux. */
const toutes = computed<Annonce[]>(() =>
  erreurCharge.value || !charge.value ? [] : charge.value.data,
)
const meta = computed(() => (erreurCharge.value || !charge.value ? null : charge.value.meta))

// ─────────────────────────────────────────────── l'état vient de l'URL

/** Une valeur de requête peut arriver en tableau : on ne garde que la première. */
function param(nom: string): string {
  const v = route.query[nom]
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

const vue = computed(() => {
  const v = param('vue')
  return v === 'grille' || v === 'filiere' ? v : 'echeance'
})

const filiere = computed(() => param('filiere'))
const type = computed(() => param('type'))
const region = computed(() => param('region'))
const recherche = computed(() => param('q'))
const sous7j = computed(() => param('sous') === '7j')
const avecPrep = computed(() => param('prep') === 'oui')
const avecCloses = computed(() => param('closes') === 'oui')

/**
 * Écrit un filtre dans l'URL — `replace` et non `push`.
 *
 * Chaque case cochée n'est pas une étape de navigation : empiler douze entrées
 * d'historique obligerait le candidat à douze retours arrière pour sortir de
 * l'écran. La vue et les filtres partagent ce comportement.
 *
 * Une valeur vide RETIRE la clé plutôt que d'écrire `?filiere=` : une URL
 * partagée ne doit pas porter de filtre fantôme.
 */
function poser(nom: string, valeur: string | null): void {
  const q: Record<string, string> = {}

  for (const [cle, brut] of Object.entries(route.query)) {
    const v = Array.isArray(brut) ? brut[0] : brut
    if (v) q[cle] = String(v)
  }

  if (valeur) q[nom] = valeur
  else delete q[nom]

  router.replace({ query: q })
}

function basculer(nom: string, valeur: string): void {
  poser(nom, param(nom) === valeur ? null : valeur)
}

// ─────────────────────────────────────────────────────────── filtrage

const filtrees = computed(() => {
  const q = recherche.value.trim().toLowerCase()

  return toutes.value.filter((a) => {
    /* Les closes sont MASQUÉES par défaut, et récupérables par une case. Les
     * montrer d'office ferait passer un dépôt fermé pour une occasion. */
    if (!avecCloses.value && !estOuverte(a)) return false
    if (sous7j.value && echeanceDe(a).palier !== 'imminente') return false
    if (filiere.value && (a.naja7i.filiere ?? '') !== filiere.value) return false
    if (type.value && a.type !== type.value) return false
    if (region.value && !a.regions.includes(region.value)) return false
    if (avecPrep.value && rattachementDe(a) !== 'prepare') return false

    if (q) {
      const foin = [a.titre, a.org, a.grade ?? '', ...a.specialites, ...a.regions]
        .join(' ').toLowerCase()
      if (!foin.includes(q)) return false
    }

    return true
  })
})

/** Le nombre de filtres actifs — annoncé sur le bouton du rail replié. */
const actifs = computed(() =>
  [filiere.value, type.value, region.value, recherche.value].filter(Boolean).length
  + (sous7j.value ? 1 : 0) + (avecPrep.value ? 1 : 0) + (avecCloses.value ? 1 : 0),
)

// ──────────────────────────────────────────────────── les trois vues

/** Les paliers d'échéance. L'urgence est un palier NOMMÉ, pas une teinte. */
const PALIERS: { cle: string, garde: (a: Annonce) => boolean }[] = [
  { cle: 'palier_7j', garde: a => (a.jours ?? -1) >= 0 && (a.jours ?? -1) <= 7 && a.stage === 'annonce' },
  { cle: 'palier_30j', garde: a => (a.jours ?? -1) > 7 && (a.jours ?? -1) <= 30 && a.stage === 'annonce' },
  { cle: 'palier_plus', garde: a => (a.jours ?? -1) > 30 && a.stage === 'annonce' },
  { cle: 'palier_suite', garde: a => a.stage !== 'annonce' && (a.jours ?? -1) >= 0 },
  { cle: 'palier_clos', garde: a => a.jours === null || a.jours < 0 },
]

const groupes = computed<{ titre: string, annonces: Annonce[] }[]>(() => {
  if (vue.value === 'grille') {
    return [{ titre: '', annonces: filtrees.value }]
  }

  if (vue.value === 'filiere') {
    const par = new Map<string, Annonce[]>()
    for (const a of filtrees.value) {
      const cle = a.naja7i.filiere ?? '__aucune'
      if (!par.has(cle)) par.set(cle, [])
      par.get(cle)!.push(a)
    }
    return [...par.entries()].map(([cle, liste]) => ({
      titre: cle === '__aucune'
        ? t('opportunites.filiere_aucune')
        : te(`opportunites.filiere_${cle}`) ? t(`opportunites.filiere_${cle}`) : cle,
      annonces: liste,
    }))
  }

  /* Par échéance — le défaut. Une annonce n'apparaît que dans UN palier :
   * `vus` empêche qu'une close comptée « étape suivante » se répète plus bas. */
  const vus = new Set<string>()
  const out: { titre: string, annonces: Annonce[] }[] = []

  for (const palier of PALIERS) {
    const liste = filtrees.value
      .filter(a => !vus.has(a.id) && palier.garde(a))
      .sort((a, b) => (a.jours ?? 9999) - (b.jours ?? 9999))

    liste.forEach(a => vus.add(a.id))
    if (liste.length) out.push({ titre: t(`opportunites.${palier.cle}`), annonces: liste })
  }

  return out
})

// ────────────────────────────────────────────── options des filtres

function compter(extraire: (a: Annonce) => string[]): { valeur: string, n: number }[] {
  const compte = new Map<string, number>()
  for (const a of toutes.value) {
    for (const v of extraire(a)) {
      if (v) compte.set(v, (compte.get(v) ?? 0) + 1)
    }
  }
  return [...compte.entries()]
    .map(([valeur, n]) => ({ valeur, n }))
    .sort((x, y) => y.n - x.n)
}

const optionsFiliere = computed(() => compter(a => [a.naja7i.filiere ?? '']))
const optionsType = computed(() => compter(a => [a.type]))
const optionsRegion = computed(() => compter(a => a.regions).slice(0, 10))

/** Le rail est replié sur téléphone, ouvert sur grand écran. Voir commun.css. */
const railOuvert = ref(false)

function libelle(prefixe: string, code: string): string {
  const cle = `opportunites.${prefixe}_${code}`
  return te(cle) ? t(cle) : code
}

useSeoCatalogue({
  title: t('opportunites.seo_titre'),
  description: t('opportunites.seo_description'),
  path: '/opportunites',
})
</script>

<template>
  <div>
    <div class="enveloppe tapis__entete">
      <p class="oeil">{{ t('opportunites.titre') }}</p>
      <h1 class="tapis__titre">{{ t('opportunites.h1') }}</h1>
      <p class="chapeau">{{ t('opportunites.chapeau') }}</p>

      <p v-if="meta?.fixture" class="tapis__fixture" dir="auto">
        {{ t('accueil.fil_fixture', { source: meta.source }) }}
      </p>
    </div>

    <div class="enveloppe tapis">
      <!-- Sur téléphone, trente lignes de filtres avant la première annonce
           enterrent le contenu. Le bouton n'existe qu'en dessous de 62 rem. -->
      <button
        type="button"
        class="btn btn--fantome js-filtres"
        :aria-expanded="railOuvert"
        aria-controls="rail-filtres"
        @click="railOuvert = !railOuvert"
      >
        {{ t('opportunites.filtres') }}
        <span v-if="actifs > 0">({{ actifs }})</span>
      </button>

      <aside
        id="rail-filtres"
        class="rail"
        :data-ouvert="railOuvert ? 'oui' : 'non'"
        :aria-label="t('opportunites.filtres')"
      >
        <div class="rail__groupe">
          <p class="rail__titre">{{ t('opportunites.filtre_filiere') }}</p>
          <label v-for="o in optionsFiliere" :key="o.valeur" class="filtre">
            <input
              type="checkbox"
              :checked="filiere === o.valeur"
              @change="basculer('filiere', o.valeur)"
            >
            <span>{{ libelle('filiere', o.valeur) }}</span>
            <span class="filtre__n">{{ o.n }}</span>
          </label>
        </div>

        <div class="rail__groupe">
          <p class="rail__titre">{{ t('opportunites.filtre_nature') }}</p>
          <label v-for="o in optionsType" :key="o.valeur" class="filtre">
            <input type="checkbox" :checked="type === o.valeur" @change="basculer('type', o.valeur)">
            <span>{{ libelle('type', o.valeur) }}</span>
            <span class="filtre__n">{{ o.n }}</span>
          </label>
        </div>

        <div class="rail__groupe">
          <p class="rail__titre">{{ t('opportunites.filtre_region') }}</p>
          <label v-for="o in optionsRegion" :key="o.valeur" class="filtre">
            <input type="checkbox" :checked="region === o.valeur" @change="basculer('region', o.valeur)">
            <span dir="auto">{{ o.valeur }}</span>
            <span class="filtre__n">{{ o.n }}</span>
          </label>
        </div>

        <div class="rail__groupe">
          <label class="filtre">
            <input type="checkbox" :checked="sous7j" @change="poser('sous', sous7j ? null : '7j')">
            <span>{{ t('opportunites.filtre_7j') }}</span>
          </label>
          <label class="filtre">
            <input type="checkbox" :checked="avecPrep" @change="poser('prep', avecPrep ? null : 'oui')">
            <span>{{ t('opportunites.filtre_prep') }}</span>
          </label>
          <label class="filtre">
            <input type="checkbox" :checked="avecCloses" @change="poser('closes', avecCloses ? null : 'oui')">
            <span>{{ t('opportunites.filtre_closes') }}</span>
          </label>
        </div>
      </aside>

      <div>
        <div class="barre-tapis">
          <div class="recherche">
            <input
              type="search"
              :value="recherche"
              :placeholder="t('opportunites.recherche_indice')"
              :aria-label="t('opportunites.recherche_aria')"
              @input="poser('q', ($event.target as HTMLInputElement).value || null)"
            >
          </div>

          <!-- `aria-pressed` porte l'état actif : la couleur seule ne le dirait
               pas à un lecteur d'écran. -->
          <div class="vues" role="group" :aria-label="t('opportunites.mode_affichage')">
            <button
              v-for="v in ['echeance', 'grille', 'filiere']"
              :key="v"
              type="button"
              class="vue"
              :aria-pressed="vue === v"
              @click="poser('vue', v === 'echeance' ? null : v)"
            >
              {{ t(`opportunites.vue_${v}`) }}
            </button>
          </div>

          <span class="tapis__compte">{{ t('opportunites.n_annonces', filtrees.length, { named: { n: filtrees.length } }) }}</span>
        </div>

        <div v-if="!filtrees.length" class="vide">
          {{ t('opportunites.aucune') }}
        </div>

        <template v-for="groupe in groupes" v-else :key="groupe.titre">
          <h2 v-if="groupe.titre" class="tapis__palier">
            {{ groupe.titre }} <span>{{ groupe.annonces.length }}</span>
          </h2>

          <div class="tapis__grille">
            <CarteAnnonce v-for="a in groupe.annonces" :key="a.id" :annonce="a" :titre-niveau="3" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tapis__entete { padding-block: var(--e-6) var(--e-4); }
.tapis__titre { font-size: var(--t-4xl); max-inline-size: 20ch; }
.tapis__fixture { margin-block-start: var(--e-3); font-size: var(--t-xs); color: var(--texte-doux); }
</style>
