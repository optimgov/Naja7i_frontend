<script setup lang="ts">
import type { Plan } from '~/composables/useAbonnement'
import type { CategorieDePublic } from '~/utils/publicVise'
import type { ProfilPrepare } from '~/composables/useMonDossier'

/**
 * `/tarifs` — la surface commerciale, publique et indexable.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ON ANNONCE CE QUE LE CANDIDAT GAGNE, JAMAIS UN NOM DE CAPACITÉ
 *
 * Le serveur sert `corrections.cause` — un code technique, juste et illisible.
 * Le candidat lit « les causes de vos erreurs ». Il n'achète pas une capacité,
 * il achète de comprendre pourquoi il s'est trompé.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE LIBELLÉ VIENT DU SERVEUR, ET PLUS D'UNE CARTE ÉCRITE ICI — M-009, pas 4
 *
 * Cet écran tenait une correspondance code → clé i18n, typée exhaustive. La
 * garantie de compilation était réelle, et pourtant la carte avait DÉJÀ divergé
 * du catalogue :
 *
 *   · elle annonçait `certification.take`, une fonction qui n'existe pas et
 *     qu'aucune offre ne compose (D-CAT-3 : « vendable ≠ existant ») ;
 *   · elle ignorait `questions.answer`, que les trois paliers ouvrent depuis
 *     l'arbitrage D-CAT-1 — le gain le plus concret des trois n'était pas dit ;
 *   · un code inconnu disparaissait en silence, si bien qu'une capacité neuve
 *     se serait vendue sans que personne ne le voie.
 *
 * Le référentiel bilingue existe côté serveur (`CapabilityDefinition`), il est
 * administrable, et `capability_details` le sert déjà présenté et traduit. Une
 * carte tenue dans un gabarit ne peut que vieillir : elle décrit un catalogue
 * qu'elle ne lit pas. C'est la directive du paramétrage d'abord, appliquée à un
 * écran qui l'enfreignait sans le savoir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DIRE LA CONDITION, NE PAS CACHER L'OFFRE — M-009, pas 5
 *
 * Une offre peut être réservée à un public. Trois façons de le rendre étaient
 * possibles, et deux sont fausses :
 *
 *   · MASQUER l'offre ferait disparaître du catalogue public une chose que le
 *     candidat peut voir ailleurs, et le laisserait sans explication ;
 *   · GRISER le bouton reconstituerait le 403 en français — la règle du dépôt
 *     est nette : soit l'action est proposée, soit elle n'existe pas dans le
 *     rendu. Aucun bouton désactivé, aucun lien masqué en CSS.
 *
 * On DIT donc la condition, et l'on retire l'action. La mention se lit AVANT
 * le bouton dans le DOM : un lecteur d'écran qui annonce l'action avant sa
 * condition inverse l'ordre de la décision.
 *
 * ON NE PARLE QUE DANS UN SEUL CAS — condition posée, catégorie connue,
 * différentes. Le raisonnement complet est dans `conditionDePublic()`, et le
 * piège aussi : `audience` absente sur le profil veut dire « on ne sait pas »,
 * jamais « non éligible ». Fermer le bouton là-dessus serait PLUS STRICT QUE
 * LE SERVEUR, donc faux — il ne refuse que ce qu'il sait.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUCUN PRIX EN DUR ICI
 *
 * Les offres viennent de l'API. Un tarif recopié dans un gabarit vieillit en
 * silence, et sur un prix affiché la divergence n'est pas une gêne : c'est une
 * promesse rompue.
 */
definePageMeta({ layout: 'public' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { plans } = useAbonnement()
const { profil } = useMonDossier()
const { isAuthenticated } = useAuth()

const { data: offres, error: erreurOffres } = await plans()

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * LIRE LE PROFIL SANS FAIRE PAYER L'ANONYME
 *
 * `/tarifs` est une SURFACE PUBLIQUE, et le dépôt y tient une règle explicite
 * (voir `se-preparer.vue`) : rien n'y appelle `fetchMe()`, parce qu'une page
 * faite pour être indexée ne doit pas coûter une requête d'API par rendu.
 * Conséquence mesurée : `isAuthenticated` est TOUJOURS faux au rendu serveur
 * de cette page, même pour un candidat connecté — s'y fier n'aurait jamais lu
 * le profil, et la mention ne serait apparue qu'en navigation client, c'est-à-
 * dire différemment selon la façon d'arriver sur la page.
 *
 * On regarde donc si un cookie de session ACCOMPAGNE la requête. Ce n'est pas
 * une déduction de droit — on ne conclut rien sur ce que le candidat peut
 * acheter : on décide seulement s'il vaut la peine de DEMANDER. Un cookie
 * périmé donne un 401, donc une catégorie inconnue, donc toutes les offres
 * proposées : le mauvais pari coûte une requête, jamais une vente.
 *
 * L'anonyme — l'immense majorité du trafic d'une page indexée — ne paie
 * toujours rien, ce qui lève la raison même de la règle qu'on écarte ici.
 *
 * Côté navigateur, `isAuthenticated` est renseigné et vaut mieux qu'un cookie :
 * `naja7i-session` est `HttpOnly`, donc invisible depuis `document.cookie`.
 */
const cookies = import.meta.server ? (useRequestHeaders(['cookie']).cookie ?? '') : ''

const peutAvoirUnProfil = import.meta.server
  ? cookies.includes('naja7i-session')
  : isAuthenticated.value

/* Une lecture refusée n'est pas un zéro : le profil DISPARAÎT, et une catégorie
 * absente laisse toutes les offres proposées. */
const { data: profilCandidat } = peutAvoirUnProfil
  ? await profil()
  : { data: ref<ProfilPrepare | null>(null) }

/* `useAsyncData` place `undefined` dans `error` : on teste la véracité. Une
 * liste illisible DISPARAÎT — on n'affiche pas « aucune offre », qui ferait
 * croire que le produit ne se vend pas. */
const illisible = computed(() => Boolean(erreurOffres.value) || !offres.value)
const liste = computed<Plan[]>(() => (illisible.value ? [] : offres.value!))

/* Absente ou nulle, c'est la même ignorance pour la règle qui suit. */
const categorieDuCandidat = computed<CategorieDePublic | undefined>(
  () => profilCandidat.value?.audience,
)

/** Le libellé dans la langue de la page. Les DEUX sont servis : on choisit
 *  celui qui convient, on ne traduit jamais un nom propre ici. */
function enClair(categorie: CategorieDePublic): string {
  return locale.value === 'ar' ? categorie.label_ar : categorie.label_fr
}

interface OffreAffichee {
  plan: Plan
  /** La phrase à lire, ou `null` quand il n'y a rien à dire. */
  mention: string | null
  /** Le bouton est-il RENDU ? Jamais grisé : rendu, ou absent. */
  proposable: boolean
}

/*
 * UNE SEULE LECTURE PAR OFFRE, DEUX CONSÉQUENCES.
 *
 * La mention et le bouton sortent du même appel. Les laisser interroger la
 * règle chacun de son côté serait se donner deux occasions de diverger — et le
 * jour où elles divergeraient, l'écran dirait « réservée aux CRMEF » sous un
 * bouton qui la propose, ou l'inverse.
 */
const offresAffichees = computed<OffreAffichee[]>(() =>
  liste.value.map((plan) => {
    const condition = conditionDePublic(plan.audience, categorieDuCandidat.value)

    return {
      plan,
      mention: condition === null
        ? null
        : t('tarifs.reservee', { public: enClair(condition) }),
      proposable: condition === null,
    }
  }),
)

/**
 * CE QUE CHAQUE CAPACITÉ OUVRE — servi présenté, dans la langue de la page.
 *
 * `capability_details` porte `{ code, label, description }`. Le serveur refuse
 * de servir une capacité dont le référentiel bilingue est incomplet : il n'y a
 * donc rien à filtrer ici, et aucun code brut ne peut atteindre l'écran.
 *
 * Le repli sur `capabilities` n'existe pas : si le champ manque, la liste
 * disparaît. Un code technique affiché à un candidat serait pire que le
 * silence, et une phrase inventée à sa place serait pire encore.
 */
function gains(plan: Plan): { code: string, label: string }[] {
  return plan.capability_details ?? []
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
      <article v-for="offre in offresAffichees" :key="offre.plan.code" class="offre">
        <h2 class="offre__nom" dir="auto">{{ offre.plan.name }}</h2>

        <p class="offre__prix">
          <span class="offre__montant">{{ prixEnClair(offre.plan.price_cents, offre.plan.currency) }}</span>
          <span class="offre__duree">{{ dureeDe(offre.plan) }}</span>
        </p>

        <!-- LA CONDITION SE LIT AVANT L'ACTION, et c'est de l'accessibilité,
             pas de la mise en page : un lecteur d'écran qui annonce le bouton
             avant sa condition inverse l'ordre de la décision. Elle porte
             `dir="auto"` parce qu'elle contient un nom servi par l'API. -->
        <p v-if="offre.mention" class="offre__public" dir="auto">{{ offre.mention }}</p>

        <p v-if="offre.plan.description" class="offre__texte" dir="auto">{{ offre.plan.description }}</p>

        <!-- CE QUE LE CANDIDAT GAGNE, jamais un nom de capacité. Le libellé
             vient du référentiel bilingue du serveur : `dir="auto"`, comme
             toute chaîne servie par l'API. -->
        <ul class="offre__gains">
          <li v-for="gain in gains(offre.plan)" :key="gain.code">
            <span class="offre__coche" aria-hidden="true">✓</span>
            <span dir="auto">{{ gain.label }}</span>
          </li>
        </ul>

        <NuxtLink
          v-if="offre.proposable"
          class="btn btn--bloc"
          :to="versLaCommande(offre.plan)"
        >
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

/* SOBRE, ET SANS COULEUR D'ALERTE. Ce n'est ni une erreur ni un refus : c'est
   une condition du produit, dite au moment où le candidat choisit. Une teinte
   d'alerte lui ferait lire « vous avez fait quelque chose de mal ».
   `border-inline-start` et non `border-left` : le repère doit passer à droite
   en arabe (RTL-03). */
.offre__public {
  margin: 0;
  padding-inline-start: var(--e-3);
  border-inline-start: 2px solid var(--bordure);
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

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
