<script setup lang="ts">
import type { EntreeRecherche } from '~/composables/useRecherche'

/**
 * `/recherche?q=` — le résultat complet, à une adresse.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `noindex, follow` — ET LES DEUX MOITIÉS COMPTENT
 *
 * `noindex` : une page de résultats internes n'apporte rien à un moteur, et
 * indexée elle en produit une infinité — une par question posée — qui se
 * concurrencent entre elles et diluent les pages réelles. C'est la faute la
 * plus banale d'un site à facettes.
 *
 * `follow` : les liens qu'elle porte, eux, mènent à des pages qui DOIVENT être
 * indexées. `noindex, nofollow` couperait la découverte en même temps que
 * l'indexation.
 *
 * ELLE N'APPELLE PAS `useSeoCatalogue`, qui pose une balise canonique et des
 * `hreflang` : déclarer une canonique sur une page qu'on demande à ne pas
 * indexer envoie deux instructions contradictoires. Titre et description
 * suffisent — ils servent l'onglet du navigateur et le partage, pas le moteur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA QUESTION VIT DANS L'URL
 *
 * Comme les filtres du tapis : sans cela, un résultat n'est ni partageable, ni
 * rechargeable, et le retour arrière du navigateur ne ramène rien. L'état de
 * l'écran est DÉRIVÉ de la route, jamais dupliqué à côté.
 */
definePageMeta({ layout: 'public' })

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const localePath = useLocalePath()

const { chercher, grouper } = useRecherche()

/** Une valeur de requête peut arriver en tableau : on ne garde que la première. */
const question = computed(() => {
  const v = route.query.q
  return (Array.isArray(v) ? v[0] : v) ?? ''
})

/*
 * `useAsyncData` avec `watch` : la recherche est refaite quand la question
 * change, y compris au retour arrière du navigateur — qui modifie la route sans
 * remonter le composant.
 */
const { data: reponse, pending } = await useAsyncData(
  () => `recherche:${question.value}`,
  () => chercher(question.value, 50),
  { watch: [question] },
)

const resultats = computed<EntreeRecherche[]>(() => reponse.value?.data ?? [])
const groupes = computed(() => grouper(resultats.value))
const meta = computed(() => reponse.value?.meta ?? null)

const tropCourt = computed(() => meta.value?.trop_court !== false)
const partielle = computed(() => !tropCourt.value && meta.value?.sources.catalogue === false)

/** La saisie de la page écrit dans l'URL — `replace`, pour ne pas empiler une
 *  entrée d'historique par caractère tapé. */
function poser(valeur: string): void {
  router.replace({ query: valeur ? { q: valeur } : {} })
}

/** L'état se LIT. Aucun code d'énumération brut à l'écran. */
function etat(entree: EntreeRecherche): string {
  if (!entree.etat) return ''

  const cle = entree.type === 'opportunite'
    ? `recherche.etat_${entree.etat}`
    : `catalogue.dispo_${entree.etat}`

  return te(cle) ? t(cle) : ''
}

useHead({
  title: () => `${t('recherche.seo_titre')} — Naja7i.ma`,
  meta: [
    { name: 'robots', content: 'noindex,follow' },
    { name: 'description', content: t('recherche.seo_description') },
  ],
})
</script>

<template>
  <div class="enveloppe section resultats">
    <p class="oeil">{{ t('recherche.titre') }}</p>
    <h1 class="titre-page">{{ t('recherche.h1') }}</h1>

    <div class="recherche resultats__champ">
      <input
        type="search"
        :value="question"
        :placeholder="t('recherche.indice')"
        :aria-label="t('recherche.titre')"
        @input="poser(($event.target as HTMLInputElement).value)"
      >
    </div>

    <p class="resultats__compte" role="status" aria-live="polite">
      <span v-if="tropCourt">{{ t('recherche.trop_court', { n: 2 }) }}</span>
      <span v-else-if="pending">{{ t('recherche.en_cours') }}</span>
      <span v-else>
        {{ t('recherche.n_resultats', meta?.total ?? 0, { named: { n: meta?.total ?? 0 } }) }}
      </span>
    </p>

    <template v-if="groupes.length">
      <section v-for="groupe in groupes" :key="groupe.type" class="resultats__groupe">
        <h2 class="resultats__titre">{{ t(`recherche.groupe_${groupe.type}`) }}</h2>

        <ul class="resultats__liste">
          <li v-for="entree in groupe.entrees" :key="entree.chemin">
            <NuxtLink class="resultats__lien" :to="localePath(entree.chemin)">
              <span class="resultats__nom" dir="auto">{{ entree.titre }}</span>
              <span v-if="entree.contexte" class="resultats__contexte" dir="auto">
                {{ entree.contexte }}
              </span>
              <span v-if="etat(entree)" class="resultats__etat">{{ etat(entree) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>

    <!-- Le catalogue n'a pas répondu : « aucun résultat » serait une
         affirmation fausse. On dit ce qui s'est passé. -->
    <div v-else-if="partielle" class="vide">
      <p>{{ t('recherche.source_manquante') }}</p>
    </div>

    <div v-else-if="!tropCourt && !pending" class="vide resultats__vide">
      <p>{{ t('recherche.aucun') }}</p>
      <div class="resultats__portes">
        <NuxtLink class="btn btn--fantome" :to="localePath('/concours')">
          {{ t('catalogue.concours') }}
        </NuxtLink>
        <NuxtLink class="btn btn--fantome" :to="localePath('/opportunites')">
          {{ t('opportunites.titre') }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resultats__champ { max-inline-size: 32rem; margin-block-end: var(--e-3); }
.resultats__compte { font-size: var(--t-sm); color: var(--texte-doux); margin-block-end: var(--e-5); }

.resultats__groupe { margin-block-end: var(--e-6); }

.resultats__titre {
  margin-block: 0 var(--e-3);
  padding-block-end: var(--e-2);
  border-block-end: 1px solid var(--bordure);
  font-size: var(--t-s);
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--texte-doux);
}

.resultats__liste { display: grid; gap: var(--e-2); margin: 0; padding: 0; list-style: none; }

/* 44 px de cible tactile, comme toutes les portes de ce dépôt. */
.resultats__lien {
  display: grid;
  gap: 2px;
  min-block-size: 44px;
  padding: var(--e-3) var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  text-decoration: none;
  color: var(--texte);
}

.resultats__lien:hover { border-color: var(--accent); background: var(--accent-doux); }

.resultats__nom { font-weight: 700; color: var(--lien); }
.resultats__contexte { font-size: var(--t-sm); color: var(--texte-doux); }
.resultats__etat { font-size: var(--t-xs); color: var(--texte-doux); }

.resultats__vide { display: grid; gap: var(--e-4); justify-items: center; }
.resultats__portes { display: flex; flex-wrap: wrap; gap: var(--e-3); justify-content: center; }
</style>
