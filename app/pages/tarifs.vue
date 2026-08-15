<script setup lang="ts">
import type { Plan } from '~/composables/useAbonnement'

/**
 * `/tarifs` — la surface commerciale, publique et indexable.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ON ANNONCE CE QUE LE CANDIDAT GAGNE, JAMAIS UN NOM DE CAPACITÉ
 *
 * Le serveur sert `corrections.cause` — un code technique, juste et illisible.
 * L'écran écrit « les causes de vos erreurs, sans limite ». Un candidat
 * n'achète pas une capacité, il achète de comprendre pourquoi il s'est trompé.
 *
 * La correspondance est une CARTE EXHAUSTIVE : ajouter une capacité au contrat
 * sans lui donner de libellé fait rougir le typage. C'est la leçon du BLOC-5 de
 * l'audit — une correspondance par défaut laisse passer le prochain code, et
 * l'écran afficherait alors `certification.take` à un candidat.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUCUN PRIX EN DUR ICI
 *
 * Les offres viennent de l'API. Un tarif recopié dans un gabarit vieillit en
 * silence, et sur un prix affiché la divergence n'est pas une gêne : c'est une
 * promesse rompue.
 */
definePageMeta({ layout: 'public' })

const { t, te } = useI18n()
const localePath = useLocalePath()
const { plans } = useAbonnement()
const { isAuthenticated } = useAuth()

const { data: offres, error: erreurOffres } = await plans()

/* `useAsyncData` place `undefined` dans `error` : on teste la véracité. Une
 * liste illisible DISPARAÎT — on n'affiche pas « aucune offre », qui ferait
 * croire que le produit ne se vend pas. */
const illisible = computed(() => Boolean(erreurOffres.value) || !offres.value)
const liste = computed<Plan[]>(() => (illisible.value ? [] : offres.value!))

/**
 * CE QUE CHAQUE CAPACITÉ OUVRE, dit au candidat.
 *
 * Exhaustive par construction : un code ajouté au contrat sans libellé ici
 * fait rougir `nuxt typecheck` en le nommant.
 */
type Capacite = 'corrections.cause' | 'series.targeted' | 'simulator.full' | 'certification.take'

const LIBELLES = {
  'corrections.cause': 'tarifs.gain_cause',
  'series.targeted': 'tarifs.gain_entrainement',
  'simulator.full': 'tarifs.gain_simulateur',
  'certification.take': 'tarifs.gain_attestation',
} as const satisfies Record<Capacite, string>

function gainDe(capacite: string): string | null {
  const cle = LIBELLES[capacite as Capacite]

  /* Un code inconnu ne s'affiche PAS. Mieux vaut une ligne manquante qu'un
   * identifiant technique servi à un candidat. */
  return cle && te(cle) ? t(cle) : null
}

function gains(plan: Plan): string[] {
  return plan.capabilities.map(gainDe).filter((g): g is string => g !== null)
}

/** La durée en clair. Nulle = sans terme, et on l'écrit. */
function dureeDe(plan: Plan): string {
  return plan.duration_days === null
    ? t('tarifs.sans_terme')
    : t('tarifs.n_jours', plan.duration_days, { named: { n: plan.duration_days } })
}

/**
 * Où mène le bouton.
 *
 * Un visiteur non connecté passe par la connexion, puis arrive sur l'écran
 * d'abonnement. On ne lui demande pas de retrouver la page seul après s'être
 * identifié — c'est le moment exact où l'on perd un achat.
 */
function versLaCommande(plan: Plan): string {
  const cible = `/app/abonnement?plan=${encodeURIComponent(plan.code)}`

  return isAuthenticated.value
    ? localePath(cible)
    : `${localePath('/connexion')}?suite=${encodeURIComponent(localePath(cible))}`
}

useSeoCatalogue({
  title: t('tarifs.seo_titre'),
  description: t('tarifs.seo_description'),
  path: '/tarifs',
})
</script>

<template>
  <div class="enveloppe tarifs">
    <p class="oeil">{{ t('tarifs.oeil') }}</p>
    <h1 class="titre-page">{{ t('tarifs.titre') }}</h1>
    <p class="chapeau">{{ t('tarifs.chapeau') }}</p>

    <div v-if="illisible" class="alerte alerte--systeme" role="alert">
      <span>{{ t('tarifs.illisible') }}</span>
    </div>

    <div v-else class="offres">
      <article v-for="plan in liste" :key="plan.code" class="offre">
        <h2 class="offre__nom" dir="auto">{{ plan.name }}</h2>

        <p class="offre__prix">
          <span class="offre__montant">{{ prixEnClair(plan.price_cents, plan.currency) }}</span>
          <span class="offre__duree">{{ dureeDe(plan) }}</span>
        </p>

        <p v-if="plan.description" class="offre__texte" dir="auto">{{ plan.description }}</p>

        <!-- CE QUE LE CANDIDAT GAGNE, jamais un nom de capacité. -->
        <ul class="offre__gains">
          <li v-for="gain in gains(plan)" :key="gain">
            <span class="offre__coche" aria-hidden="true">✓</span>{{ gain }}
          </li>
        </ul>

        <NuxtLink class="btn btn--bloc" :to="versLaCommande(plan)">
          {{ t('tarifs.choisir') }}
        </NuxtLink>
      </article>
    </div>

    <!-- LE MOYEN EST DIT SANS DÉTOUR. Un candidat qui découvre au moment de
         payer qu'il n'y a pas de carte bancaire se sent trompé ; le dire ici en
         fait une modalité, pas une déception. -->
    <section class="tarifs__moyen">
      <h2>{{ t('tarifs.moyen_titre') }}</h2>
      <p>{{ t('tarifs.moyen_texte') }}</p>
      <p class="tarifs__note">{{ t('tarifs.moyen_note') }}</p>
    </section>
  </div>
</template>

<style scoped>
.tarifs { padding-block: var(--e-6) var(--e-8); }

.offres {
  display: grid;
  gap: var(--e-4);
  margin-block: var(--e-6);
}

@media (min-width: 48rem) {
  .offres { grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); }
}

.offre {
  display: flex;
  flex-direction: column;
  gap: var(--e-3);
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r-m);
}

.offre__nom { margin: 0; font-size: var(--t-xl); }

.offre__prix { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--e-2); margin: 0; }

.offre__montant {
  font-family: var(--mono);
  font-size: var(--t-2xl);
  font-weight: 800;
  letter-spacing: -0.02em;
}

.offre__duree { font-size: var(--t-sm); color: var(--texte-doux); }

.offre__texte { margin: 0; font-size: var(--t-sm); color: var(--texte-doux); }

.offre__gains {
  display: grid;
  gap: var(--e-2);
  margin: 0;
  /* `margin-block-end: auto` colle le bouton en bas : les cartes d'une rangée
     alignent leurs actions même si leurs listes diffèrent. */
  margin-block-end: auto;
  padding: 0;
  list-style: none;
  font-size: var(--t-sm);
}

.offre__gains li { display: grid; grid-template-columns: auto 1fr; gap: var(--e-2); }

/* `--peda-juste-texte` et non `--peda-juste` : le second rend 4,3:1 sur la
   surface claire — mesuré par l'audit de rendu, sous le seuil de 4,5. Le socle
   porte les deux nuances pour exactement cette raison, l'une pour les aplats,
   l'autre pour ce qui se lit. */
.offre__coche { color: var(--peda-juste-texte); font-weight: 800; }

.tarifs__moyen {
  margin-block-start: var(--e-6);
  padding-block-start: var(--e-5);
  border-block-start: 1px solid var(--bordure);
}

.tarifs__moyen h2 { font-size: var(--t-lg); }
.tarifs__note { font-size: var(--t-sm); color: var(--texte-doux); max-inline-size: 64ch; }
</style>
