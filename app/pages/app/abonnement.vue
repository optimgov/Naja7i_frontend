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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE LIGNE PAR DROIT, ET AUCUN TOTAL — S-03, pas 1 de M-009
 *
 * Cet écran affichait UNE date : la plus proche échéance, toutes capacités
 * confondues, sous « votre abonnement est actif jusqu'au 14 mars ». Le
 * raisonnement écrit ici était qu'un candidat ne veut pas faire le calcul
 * lui-même. Il était faux, et le droit transitoire l'a rendu visible : un
 * compte peut porter le même jour un palier gratuit SANS TERME et un accès de
 * transition de soixante jours. La date unique effaçait alors la seule chose
 * qui demandait une décision — ce qui s'arrête, et quand.
 *
 * Le serveur rend maintenant `droits` : une ligne par (nature, échéance),
 * triée par ce qui ferme d'abord, le sans-terme en dernier. L'écran RESTITUE
 * cette liste. Il n'additionne rien, il ne résume rien, il ne recompose aucune
 * date — deux droits datés ne font pas une durée cumulée, et un « total »
 * serait un chiffre que personne n'a décidé.
 *
 * L'ESSAI CLÔTURÉ NE SE ROUVRE PAS. Il n'apparaît nulle part comme une offre à
 * reprendre : `droits` ne porte que des droits ACTIFS, et le catalogue exclut
 * le porteur du gratuit (`enVente`). Un essai clos se lit dans l'état du
 * compte — un passé — et la seule sortie est d'acheter (ADR-0033).
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const { t, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { plans, commandes, saisirCoupon } = useAbonnement()
const { acces } = useAcces()

const { data: offres } = await plans()
const { data: mesCommandes, refresh: rafraichirCommandes } = await commandes()

const {
  lu: accesLu,
  etat: etatCompte,
  etatLabel,
  sortie,
  droits,
  quotas,
  rafraichir: rafraichirEtat,
} = await acces()

const enAttente = computed(() =>
  (mesCommandes.value ?? []).filter(c => c.status === 'en_attente'),
)

/**
 * Une date d'échéance, en toutes lettres et dans la langue de la page.
 *
 * `null` reste `null` : un droit sans terme n'a pas de date, et lui en
 * fabriquer une — même « illimité » écrit comme une date — mentirait sur sa
 * nature. L'appelant écrit alors la phrase qui convient.
 *
 * `-u-nu-latn` : chiffres latins en arabe, comme partout (D-F54).
 */
function dateEnClair(iso: string | null): string | null {
  if (!iso) return null

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null

  return d.toLocaleDateString(locale.value === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

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

    <!-- ─────────────────────── L'ÉTAT ───────────────────────
         Le libellé vient du serveur (ADR-0033) : « Essai en cours », « Forfait
         actif », « Forfait terminé ». L'écran ne le déduit plus du nombre de
         capacités — une déduction qui rangeait un compte épuisé et un compte
         d'essai dans la même case « gratuit ». -->
    <section v-if="accesLu" class="etat" :data-etat="etatCompte">
      <p class="etat__ligne">
        <strong dir="auto">{{ etatLabel }}</strong>
      </p>
      <p v-if="sortie" class="etat__detail" dir="auto">{{ sortie }}</p>
    </section>

    <div v-else class="alerte alerte--systeme" role="alert">
      <span>{{ t('abonnement.etat_illisible') }}</span>
    </div>

    <!-- ───────────────── VOS DROITS, LIGNE À LIGNE — S-03 ─────────────────
         Une ligne par droit, avec sa nature dite en mots du produit et sa date
         propre. Aucune addition : deux droits datés ne font pas une durée
         cumulée. L'ordre est celui du serveur — ce qui s'arrête d'abord se lit
         d'abord, le sans-terme ferme la liste. -->
    <section v-if="droits.length" class="bloc">
      <h2>{{ t('abonnement.droits_titre') }}</h2>
      <p class="bloc__texte">{{ t('abonnement.droits_texte') }}</p>

      <ul class="droits">
        <li v-for="(droit, rang) in droits" :key="`${droit.source}-${droit.expires_at ?? 'sans'}-${rang}`" class="droit">
          <span class="droit__nature" dir="auto">{{ droit.source_label }}</span>

          <!-- La date propre du droit. Sans terme, on l'écrit — on ne comble
               pas avec une date, et on ne laisse pas la case vide. -->
          <span v-if="dateEnClair(droit.expires_at)" class="droit__echeance">
            {{ t('abonnement.jusqu_au', { date: dateEnClair(droit.expires_at) }) }}
          </span>
          <span v-else class="droit__echeance droit__echeance--sans">
            {{ t('abonnement.sans_terme') }}
          </span>
        </li>
      </ul>
    </section>

    <!-- ───────────── LES ENVELOPPES, AVEC LEUR RELIQUAT RÉEL ─────────────
         Une par droit, jamais additionnées (ADR-0031) : un renouvellement crée
         une enveloppe neuve, et un seul nombre effacerait la question qui
         compte — laquelle se vide en premier. Le reliquat est dérivé côté
         serveur au lot 3B ; l'écran ne le recalcule pas. -->
    <section v-if="quotas.length" class="bloc">
      <h2>{{ t('abonnement.enveloppes_titre') }}</h2>

      <ul class="enveloppes">
        <li v-for="(q, rang) in quotas" :key="`${q.capability}-${rang}`" class="enveloppe-ligne">
          <span class="enveloppe-ligne__reliquat">
            {{ t('abonnement.reliquat', {
              n: nombre(q.remaining),
              total: nombre(q.granted),
              unite: q.unit_label,
            }) }}
          </span>
          <span class="enveloppe-ligne__source" dir="auto">{{ q.source_label }}</span>
          <span v-if="dateEnClair(q.expires_at)" class="enveloppe-ligne__echeance">
            {{ t('abonnement.jusqu_au', { date: dateEnClair(q.expires_at) }) }}
          </span>
        </li>
      </ul>
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

    <NuxtLink class="lien-second" :to="{ path: localePath('/tarifs'), query: { espace: 'candidat' } }">
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

/* L'état est porté par le MOT servi par le serveur ; la couleur ne fait que
   redoubler — même règle que l'échéance des annonces. `data-etat` est aussi la
   prise de la recette : elle lit l'état rendu, elle ne le devine pas. */
.etat[data-etat="actif"] { border-color: var(--peda-juste); }
.etat[data-etat="epuise"] { border-color: var(--peda-remede); }

.etat__ligne { display: flex; gap: var(--e-2); align-items: baseline; margin: 0; }
.etat__detail { margin: 0; font-size: var(--t-sm); color: var(--texte-doux); }

/* --- Les droits, ligne à ligne (S-03) --- */

.droits, .enveloppes {
  display: grid;
  gap: var(--e-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.droit, .enveloppe-ligne {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-4);
  align-items: baseline;
  padding: var(--e-3) var(--e-4);
  font-size: var(--t-sm);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.droit__nature, .enveloppe-ligne__reliquat { flex: 1 1 14rem; font-weight: 700; }
.droit__echeance, .enveloppe-ligne__echeance { color: var(--texte-doux); }
/* Un droit sans terme n'est pas une date manquante : il se lit comme un fait,
   pas comme une case vide. */
.droit__echeance--sans { font-style: italic; }
.enveloppe-ligne__source { color: var(--texte-doux); }

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
