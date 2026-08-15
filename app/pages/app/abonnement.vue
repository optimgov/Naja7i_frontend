<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

/**
 * `/app/abonnement` — ce que le candidat a, jusqu'à quand, et ce qu'il attend.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ÉTAT VIENT DES DROITS, PAS DES COMMANDES
 *
 * `me/subscription` lit `AccessGrant` — la MÊME source que le mur payant. Un
 * écran qui listerait les commandes honorées afficherait ce que le candidat a
 * ACHETÉ, pas ce dont il DISPOSE, et les deux divergent dès qu'un octroi
 * expire. Le candidat verrait « abonné » sur une correction encore fermée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE COMMANDE EN ATTENTE SE DIT, ET SE DIT COMME TELLE
 *
 * « Votre code est en cours de validation » — pas « votre abonnement est
 * actif ». Le coupon a deux temps, le second est humain, et taire le délai
 * produirait un candidat qui recharge sa correction en boucle sans comprendre.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { plans, etat, commandes, saisirCoupon } = useAbonnement()

const { data: offres } = await plans()
const { data: monEtat, refresh: rafraichirEtat, error: erreurEtat } = await etat()
const { data: mesCommandes, refresh: rafraichirCommandes } = await commandes()

const capacites = computed(() => (erreurEtat.value ? [] : monEtat.value?.capabilities ?? []))
const abonne = computed(() => capacites.value.length > 0)

const enAttente = computed(() =>
  (mesCommandes.value ?? []).filter(c => c.status === 'en_attente'),
)

/**
 * L'ÉCHÉANCE LA PLUS PROCHE, et pas une par capacité à l'écran.
 *
 * Le contrat en rend une par capacité — c'est juste, un candidat peut tenir
 * deux droits de deux plans. Mais un écran qui aligne quatre dates demande au
 * candidat de faire lui-même le calcul qui l'intéresse : « jusqu'à quand
 * suis-je couvert ». On montre donc la plus proche, qui est la seule qui
 * l'oblige à agir.
 *
 * `null` pour une capacité sans terme l'emporte : elle ne se réduit pas.
 */
const echeance = computed(() => {
  const dates = Object.values(monEtat.value?.expires_at ?? {})

  if (dates.length === 0) return null
  if (dates.some(d => d === null)) return 'sans_terme'

  return (dates as string[]).sort()[0] ?? null
})

const { locale } = useI18n()

const echeanceEnClair = computed(() => {
  if (echeance.value === null || echeance.value === 'sans_terme') return null

  const d = new Date(echeance.value)
  if (Number.isNaN(d.getTime())) return null

  /* `-u-nu-latn` : chiffres latins en arabe, comme partout (D-F54). */
  return d.toLocaleDateString(locale.value === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
})

/* Le plan choisi depuis `/tarifs`, s'il y en a un : on le met en avant plutôt
 * que de laisser le candidat le rechercher dans la liste. */
const planChoisi = computed(() => String(route.query.plan ?? ''))

// ─────────────────────────────────────────────── saisie d'un coupon

/*
 * LE GABARIT DU CODE EST UN FAIT, PAS UN LIBELLÉ.
 *
 * « NJ7-XXXX-XXXX-XXXX » ne se traduit pas : traduire « NJ7 » produirait un
 * exemple qui ne ressemble à aucun code réel. Il sort donc des locales — même
 * raison que l'adresse de contact et le User-Agent sur `/robot`.
 *
 * `dir="ltr"` sur la saisie pour la même raison : un code latin dans un champ
 * RTL verrait ses tirets déplacés par l'algorithme bidirectionnel.
 */
const GABARIT_CODE = 'NJ7-XXXX-XXXX-XXXX'

const code = ref('')
const envoi = ref(false)
const erreur = ref<string | null>(null)
const succes = ref(false)

async function envoyerLeCode(): Promise<void> {
  if (envoi.value || code.value.trim() === '') return

  envoi.value = true
  erreur.value = null
  succes.value = false

  try {
    await saisirCoupon(code.value.trim())
    code.value = ''
    succes.value = true

    /* On relit l'ÉTAT et les COMMANDES : la commande naît en attente, donc
     * l'état ne bouge pas — et c'est précisément ce que l'écran doit montrer. */
    await Promise.all([rafraichirEtat(), rafraichirCommandes()])
  }
  catch (e: unknown) {
    if (e instanceof ApiRequestError) erreur.value = e.message
    else throw e
  }
  finally {
    envoi.value = false
  }
}

// ─────────────────────────────── paiement simulé (hors production)

/*
 * CHARGÉ SEULEMENT HORS PRODUCTION, ET PAS PAR UN `v-if`.
 *
 * `import.meta.dev` est remplacé par `false` à la compilation : la branche
 * devient inatteignable, l'`import()` n'est jamais analysé, et Rollup n'émet
 * pas le morceau. Le composant n'est alors pas « masqué » — il n'est pas dans
 * le bundle.
 *
 * Ma première écriture posait un `v-if` sur une constante et affirmait la même
 * chose. C'était faux : `grep` retrouvait `orders/simulated` dans `.output/`.
 * La recette greppe désormais le bundle de production, parce qu'une garantie
 * de compilation non mesurée n'en est pas une.
 */
const PaiementSimule = import.meta.dev
  ? defineAsyncComponent(() => import('~/components/PaiementSimule.vue'))
  : null

async function apresPaiement(): Promise<void> {
  await Promise.all([rafraichirEtat(), rafraichirCommandes()])
}

useHead({ title: () => t('abonnement.titre') })
</script>

<template>
  <div class="enveloppe abonnement">
    <p class="oeil">{{ t('abonnement.oeil') }}</p>
    <h1 class="titre-page">{{ t('abonnement.titre') }}</h1>

    <!-- ─────────────────────── L'ÉTAT ─────────────────────── -->
    <section class="etat" :class="{ 'etat--actif': abonne }">
      <p class="etat__ligne">
        <span class="etat__marque" aria-hidden="true">{{ abonne ? '✓' : '○' }}</span>
        <strong>{{ abonne ? t('abonnement.actif') : t('abonnement.gratuit') }}</strong>
      </p>

      <p v-if="abonne && echeance === 'sans_terme'" class="etat__detail">
        {{ t('abonnement.sans_terme') }}
      </p>
      <p v-else-if="abonne && echeanceEnClair" class="etat__detail">
        {{ t('abonnement.jusqu_au', { date: echeanceEnClair }) }}
      </p>
      <p v-else-if="!abonne" class="etat__detail">{{ t('abonnement.gratuit_texte') }}</p>
    </section>

    <!-- ─────────── LES COMMANDES EN ATTENTE — dites comme telles ─────────── -->
    <section v-if="enAttente.length" class="attente" role="status">
      <p class="attente__titre">{{ t('abonnement.attente_titre') }}</p>
      <p class="attente__texte">{{ t('abonnement.attente_texte') }}</p>

      <ul class="attente__liste">
        <li v-for="commande in enAttente" :key="commande.uuid" dir="auto">
          {{ commande.plan?.name }} — {{ prixEnClair(commande.amount_cents, commande.currency) }}
        </li>
      </ul>
    </section>

    <!-- ─────────────────────── LE CODE CADEAU ─────────────────────── -->
    <section class="bloc">
      <h2>{{ t('abonnement.code_titre') }}</h2>
      <p class="bloc__texte">{{ t('abonnement.code_texte') }}</p>

      <form class="code" @submit.prevent="envoyerLeCode">
        <label class="lecture-seule" for="code-cadeau">{{ t('abonnement.code_libelle') }}</label>
        <input
          id="code-cadeau"
          v-model="code"
          type="text"
          class="code__saisie"
          autocomplete="off"
          spellcheck="false"
          :placeholder="GABARIT_CODE"
          dir="ltr"
          :disabled="envoi"
        >
        <button type="submit" class="btn" :disabled="envoi || code.trim() === ''">
          {{ envoi ? t('abonnement.code_envoi') : t('abonnement.code_valider') }}
        </button>
      </form>

      <p v-if="succes" class="code__succes" role="status">{{ t('abonnement.code_recu') }}</p>
      <p v-if="erreur" class="champ__erreur" role="alert" dir="auto">{{ erreur }}</p>
    </section>

    <!-- Le composant n'existe pas en production : voir ci-dessus. -->
    <component
      :is="PaiementSimule"
      v-if="PaiementSimule"
      :offres="offres ?? []"
      :plan-choisi="planChoisi"
      @paye="apresPaiement"
    />

    <!-- ─────────────────────── L'HISTORIQUE ─────────────────────── -->
    <section v-if="mesCommandes?.length" class="bloc">
      <h2>{{ t('abonnement.historique_titre') }}</h2>

      <ul class="commandes">
        <li v-for="commande in mesCommandes" :key="commande.uuid" class="commande">
          <span class="commande__plan" dir="auto">{{ commande.plan?.name ?? '—' }}</span>
          <span class="commande__montant">
            {{ prixEnClair(commande.amount_cents, commande.currency) }}
          </span>
          <span class="commande__etat">{{ t(`abonnement.statut_${commande.status}`) }}</span>
        </li>
      </ul>
    </section>

    <NuxtLink class="lien-second" :to="localePath('/tarifs')">
      {{ t('abonnement.voir_offres') }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.abonnement { padding-block: var(--e-5) var(--e-7); }

.etat {
  display: grid;
  gap: var(--e-1);
  margin-block: var(--e-4);
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r-m);
}

/* L'état est porté par le MOT et par la marque ; la couleur ne fait que
   redoubler — même règle que l'échéance des annonces. */
.etat--actif { border-color: var(--peda-juste); }

.etat__ligne { display: flex; gap: var(--e-2); align-items: baseline; margin: 0; }
.etat__marque { font-weight: 800; }
/* La BORDURE prend `--peda-juste` — un aplat n'a pas de seuil de lisibilité —
   mais le signe se lit, donc il prend `--peda-juste-texte`. Mesuré : le premier
   rendait 4,3:1, sous le seuil de 4,5. */
.etat--actif .etat__marque { color: var(--peda-juste-texte); }
.etat__detail { margin: 0; font-size: var(--t-sm); color: var(--texte-doux); }

.attente {
  margin-block-end: var(--e-4);
  padding: var(--e-4);
  background: var(--surface-douce);
  border-inline-start: 4px solid var(--accent);
  border-radius: var(--r);
}

.attente__titre { margin: 0 0 var(--e-1); font-weight: 700; }
.attente__texte { margin: 0 0 var(--e-2); font-size: var(--t-sm); color: var(--texte-doux); }
.attente__liste { margin: 0; padding-inline-start: var(--e-5); font-size: var(--t-sm); }

.bloc {
  margin-block-end: var(--e-5);
  padding-block-start: var(--e-4);
  border-block-start: 1px solid var(--bordure);
}

.bloc h2 { font-size: var(--t-lg); }
.bloc__texte { font-size: var(--t-sm); color: var(--texte-doux); max-inline-size: 62ch; }

.code { display: flex; flex-wrap: wrap; gap: var(--e-2); align-items: center; }

.code__saisie {
  flex: 1 1 16rem;
  min-block-size: 44px;
  padding-inline: var(--e-3);
  font-family: var(--mono);
  font-size: var(--t-md);
  letter-spacing: 0.06em;
  color: var(--texte);
  background: var(--surface);
  border: 1px solid var(--bordure-forte);
  border-radius: var(--r);
}

.code__succes { margin-block-start: var(--e-2); font-size: var(--t-sm); color: var(--peda-juste-texte); }


.commandes { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--e-2); }

.commande {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-4);
  padding-block: var(--e-2);
  font-size: var(--t-sm);
  border-block-end: 1px solid var(--bordure);
}

.commande__plan { flex: 1 1 12rem; font-weight: 600; }
.commande__montant { font-family: var(--mono); }
.commande__etat { color: var(--texte-doux); }
</style>
