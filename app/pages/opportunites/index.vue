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

/** Les dimensions filtrables. Nommées, parce qu'on doit pouvoir en EXCLURE une. */
type Dimension = 'filiere' | 'type' | 'region' | 'sous' | 'prep' | 'closes' | 'q'

/**
 * Une annonce passe-t-elle les filtres — TOUS SAUF UN ?
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `sauf` EST TOUTE LA CORRECTION DES FACETTES
 *
 * Les compteurs du rail étaient calculés sur la liste COMPLÈTE : « Éducation
 * 14 » restait 14 après avoir coché « Clôture sous 7 jours », alors que deux
 * annonces seulement subsistaient. Le candidat cochait donc une facette qui
 * annonçait quatorze résultats et en obtenait deux — le compteur ne décrivait
 * pas la liste qu'il allait obtenir, il décrivait une liste qui n'existait plus.
 *
 * Un compteur de facette répond à UNE question : « combien de résultats si je
 * coche celle-ci ? ». Il doit donc appliquer tous les autres filtres actifs, et
 * PAS le sien — sinon un filtre à choix unique ne compterait plus que l'option
 * déjà cochée, et toutes les autres tomberaient à zéro.
 *
 * `sauf` vaut `null` pour la liste réelle : tout s'applique.
 */
function passe(a: Annonce, sauf: Dimension | null): boolean {
  /* Les closes sont MASQUÉES par défaut, et récupérables par une case. Les
   * montrer d'office ferait passer un dépôt fermé pour une occasion. */
  if (sauf !== 'closes' && !avecCloses.value && !estOuverte(a)) return false
  if (sauf !== 'sous' && sous7j.value && echeanceDe(a).palier !== 'imminente') return false
  if (sauf !== 'filiere' && filiere.value && (a.naja7i.filiere ?? '') !== filiere.value) return false
  if (sauf !== 'type' && type.value && a.type !== type.value) return false
  if (sauf !== 'region' && region.value && !a.regions.includes(region.value)) return false
  if (sauf !== 'prep' && avecPrep.value && rattachementDe(a) !== 'prepare') return false

  if (sauf !== 'q') {
    const q = recherche.value.trim().toLowerCase()
    if (q) {
      const foin = [a.titre, a.org, a.grade ?? '', ...a.specialites, ...a.regions]
        .join(' ').toLowerCase()
      if (!foin.includes(q)) return false
    }
  }

  return true
}

const filtrees = computed(() => toutes.value.filter(a => passe(a, null)))

/** Le nombre de filtres actifs — annoncé sur le bouton du rail replié. */
const actifs = computed(() =>
  [filiere.value, type.value, region.value, recherche.value].filter(Boolean).length
  + (sous7j.value ? 1 : 0) + (avecPrep.value ? 1 : 0) + (avecCloses.value ? 1 : 0),
)

// ──────────────────────────────────────────────────── les trois vues

/** Les paliers d'échéance. L'urgence est un palier NOMMÉ, pas une teinte. */
const PALIERS: { cle: string, garde: (a: Annonce) => boolean }[] = [
  /*
   * `estOuverte()` PLUTÔT QUE DE REDIRE LA RÈGLE. Ces gardes portaient
   * `jours >= 0 && stage === 'annonce'` en toutes lettres — une seconde
   * écriture de ce que `echeanceDe()` décide déjà. Elles disaient juste
   * aujourd'hui, et rien ne garantissait qu'elles suivent la première le jour
   * où elle changerait.
   *
   * C'est la faute qui a produit le défaut du rattachement : deux endroits
   * décidant si une annonce est ouverte, dont un qui ne consultait pas l'autre.
   */
  { cle: 'palier_7j', garde: a => estOuverte(a) && (a.jours ?? -1) <= 7 },
  { cle: 'palier_30j', garde: a => estOuverte(a) && (a.jours ?? -1) > 7 && (a.jours ?? -1) <= 30 },
  { cle: 'palier_plus', garde: a => estOuverte(a) && (a.jours ?? -1) > 30 },
  { cle: 'palier_suite', garde: a => !estOuverte(a) && (a.jours ?? -1) >= 0 },
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

/**
 * Les options d'une facette, comptées DANS LE CONTEXTE des autres filtres.
 *
 * DEUX RÈGLES, ET LA SECONDE EST LA PLUS UTILE :
 *
 * 1. Une option à ZÉRO n'est pas offerte. C'est un cul-de-sac : on la coche, on
 *    obtient une liste vide, et il faut la décocher. La retirer épargne
 *    l'aller-retour — et c'est la même règle que les compteurs publics de
 *    l'accueil, appliquée ici.
 *
 * 2. SAUF si elle est ACTIVE. Une option cochée qui tomberait à zéro à cause
 *    d'un autre filtre disparaîtrait du rail — et deviendrait alors impossible
 *    à DÉCOCHER. Le candidat se retrouverait enfermé dans une liste vide par un
 *    filtre qu'il ne voit plus.
 */
function compter(
  dimension: Dimension,
  extraire: (a: Annonce) => string[],
  actif: string,
): { valeur: string, n: number }[] {
  const compte = new Map<string, number>()

  for (const a of toutes.value) {
    if (!passe(a, dimension)) continue

    for (const v of extraire(a)) {
      if (v) compte.set(v, (compte.get(v) ?? 0) + 1)
    }
  }

  /* Règle 2 : l'option active reste offerte, fût-elle à zéro. */
  if (actif && !compte.has(actif)) compte.set(actif, 0)

  return [...compte.entries()]
    .map(([valeur, n]) => ({ valeur, n }))
    .filter(o => o.n > 0 || o.valeur === actif)
    .sort((x, y) => y.n - x.n)
}

const optionsFiliere = computed(
  () => compter('filiere', a => [a.naja7i.filiere ?? ''], filiere.value),
)
const optionsType = computed(() => compter('type', a => [a.type], type.value))
const optionsRegion = computed(
  () => compter('region', a => a.regions, region.value).slice(0, 10),
)

// ─────────────────────────────────────────── l'état vide, actionnable

/**
 * LES CRITÈRES EN CLAIR — et c'est ce qui manquait le plus.
 *
 * L'état vide disait « Aucune annonce ne correspond à ces filtres. » sans dire
 * LESQUELS, et sans offrir d'en sortir. Sur téléphone, où le rail est replié
 * derrière un bouton, le candidat ne voyait même pas ce qu'il avait coché : il
 * lui restait à rouvrir le rail et à décocher à l'aveugle.
 */
const criteres = computed(() => {
  const out: string[] = []

  if (recherche.value) out.push(t('opportunites.critere_recherche', { q: recherche.value }))
  if (filiere.value) out.push(libelle('filiere', filiere.value))
  if (type.value) out.push(libelle('type', type.value))
  if (region.value) out.push(region.value)
  if (sous7j.value) out.push(t('opportunites.filtre_7j'))
  if (avecPrep.value) out.push(t('opportunites.filtre_prep'))
  if (avecCloses.value) out.push(t('opportunites.filtre_closes'))

  return out
})

/**
 * TOUT RETIRER, EN UNE ACTION.
 *
 * La VUE est conservée : ce n'est pas un filtre mais un mode d'affichage, et la
 * réinitialiser ferait perdre un choix que le candidat n'a pas remis en cause.
 */
function toutRetirer(): void {
  const v = param('vue')
  router.replace({ query: v ? { vue: v } : {} })
}

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

        <!-- ═══════════════ L'ÉTAT VIDE, ET IL EST ACTIONNABLE ═══════════════
             Trois pièces : ce qui a été demandé, une action pour tout retirer,
             et une porte qui reste vraie même sans filtre. Une phrase seule
             laissait le candidat rouvrir le rail et décocher à l'aveugle — sur
             téléphone, où le rail est replié, il ne voyait même pas ses
             critères. -->
        <div v-if="!filtrees.length" class="vide vide--filtres">
          <p class="vide__phrase">{{ t('opportunites.aucune') }}</p>

          <template v-if="criteres.length">
            <p class="vide__criteres">
              <span class="vide__label">{{ t('opportunites.criteres_actifs') }}</span>
              <span v-for="critere in criteres" :key="critere" class="nature" dir="auto">
                {{ critere }}
              </span>
            </p>

            <button type="button" class="btn btn--fantome" @click="toutRetirer">
              {{ t('opportunites.tout_retirer') }}
            </button>
          </template>

          <!-- Aucun filtre actif ET aucune annonce : ce n'est plus un problème
               de critères. On ne prétend pas le contraire, et on ne propose pas
               de « tout retirer » qui ne retirerait rien. -->
          <p v-else class="vide__phrase">{{ t('opportunites.aucune_sans_filtre') }}</p>

          <NuxtLink class="lien-second" :to="localePath('/opportunites?sous=7j')">
            {{ t('opportunites.voir_proches') }}
          </NuxtLink>
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

.vide--filtres { display: grid; gap: var(--e-4); justify-items: center; }
.vide__phrase { margin: 0; max-inline-size: 52ch; }
.vide__criteres {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--e-2);
  margin: 0;
}
.vide__label { font-size: var(--t-sm); font-weight: 700; color: var(--texte); }
</style>
