<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

/**
 * E7 — configurateur d'entraînement ciblé.
 *
 * CE QU'IL FERME
 *
 * L'ordonnance disait quoi réviser, et rien n'était cliquable. Les domaines
 * proposés ici viennent d'elle : ce sont les mêmes lignes, dans le même ordre,
 * avec le même motif. Le candidat choisit, ou laisse le serveur choisir d'après
 * cette même ordonnance.
 *
 * CE QUE L'ÉCRAN NE PROMET PAS
 *
 * Une série d'entraînement vise un point faible : elle n'est PAS
 * représentative de l'épreuve, par construction. C'est dit avant le lancement,
 * pas seulement au moment du résultat — un avertissement qui arrive après le
 * score arrive trop tard.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS MURS SE CROISENT ICI, ET ILS NE SE RESSEMBLENT PAS — M-009
 *
 * 1. `series.targeted` ferme l'ACTION. Sans elle, le serveur refuse d'ouvrir
 *    la série ; l'écran ne rend donc pas le formulaire du tout. Aucun bouton
 *    grisé : le geste n'est pas dans le DOM.
 *
 * 2. `remediation.plan` ferme la LISTE DES DOMAINES, qui est l'ordonnance. Un
 *    palier Entrée ou Préparation ouvre l'entraînement SANS ouvrir la
 *    prescription : le choix « laisser Naja7i choisir » reste alors le seul, et
 *    le groupe de cases disparaît. Une liste vide sous une légende « domaine »
 *    se lirait « vous n'avez aucun point faible », ce qui est faux.
 *
 * 3. L'ENVELOPPE, elle, ne ferme rien : elle se compte. Le coût est annoncé
 *    avant le clic, avec le reliquat servi par le serveur — et si le reliquat
 *    ne couvre pas la demande, l'écran dit ce qui sera réellement composé.
 *    C'est S-10, et c'est la moitié qui arrivait après le clic.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { ouvrirEntrainement } = useTentative()
const { ordonnance, rendue } = useOrdonnance()
const { acces } = useAcces()

const codeEpreuve = computed(() => String(route.params.epreuve ?? ''))

const { lu: accesLu, ouvre, enveloppeDe } = await acces()

/** L'action est-elle ouverte ? Faux aussi quand l'état est illisible. */
const peutLancer = computed(() => ouvre(CAPACITE.SERIE_CIBLEE))

/**
 * L'enveloppe qui gouverne la composition — celle de `questions.answer`.
 *
 * `null` a deux sens, et l'écran n'a pas à les distinguer ici : ou bien rien
 * ne se décompte, ou bien il n'y a pas d'enveloppe à annoncer. Dans les deux
 * cas, le composant du coût n'écrit rien plutôt que d'inventer un nombre.
 */
const enveloppe = computed(() => enveloppeDe(CAPACITE.REPONDRE))

/* Les domaines proposés SONT les lignes de l'ordonnance. On ne recompose pas
 * une liste : ce serait un second classement, qui finirait par diverger. */
const { data: plan } = await ordonnance(codeEpreuve, 20)
const ordonnanceRendue = computed(() => rendue(plan.value))
const domaines = computed(() => plan.value?.data ?? [])

/**
 * `null` = laisser le serveur choisir. C'est la valeur par défaut.
 *
 * D-06 — LE DOMAINE PEUT VENIR DE L'ORDONNANCE, par `?domaine=`. Une ligne
 * d'ordonnance désigne un domaine et son motif ; arriver ici avec la case
 * « laisser Naja7i choisir » cochée ferait perdre le choix que le candidat
 * vient de faire, et le serveur pourrait proposer un autre domaine que celui
 * qu'il a cliqué.
 *
 * IL EST VÉRIFIÉ CONTRE L'ORDONNANCE, pas cru sur parole. Un `node_uuid`
 * inconnu de ce plan retombe sur `null` : l'écran n'affiche jamais un choix
 * coché qui ne correspond à aucune case, et le serveur ne reçoit pas un
 * périmètre que l'écran n'a pas montré.
 */
const domaineDemande = computed(() => {
  const brut = route.query.domaine
  return typeof brut === 'string' && brut !== '' ? brut : null
})

const domaineChoisi = ref<string | null>(
  domaines.value.some((l) => l.node_uuid === domaineDemande.value) ? domaineDemande.value : null,
)

const total = ref(15)

const lancement = ref(false)
const erreur = ref<ApiRequestError | null>(null)

const perimetreVide = computed(() => erreur.value?.error.code === 'TRAINING_SCOPE_EMPTY')
const perimetreEtroit = computed(() => erreur.value?.error.code === 'TRAINING_SCOPE_TOO_NARROW')

/** Détail servi par le serveur avec le 409 : combien existent, combien il faut. */
const etroitesse = computed(() => {
  const d = erreur.value?.error.details
  if (!d || Array.isArray(d)) return null
  return d as unknown as { available?: number; minimum?: number }
})

async function lancer(): Promise<void> {
  if (lancement.value) return
  lancement.value = true
  erreur.value = null

  try {
    const { tentative, meta } = await ouvrirEntrainement(codeEpreuve.value, {
      nodeUuid: domaineChoisi.value,
      total: total.value,
    })

    /*
     * `short_of_scope` voyage dans l'URL plutôt que dans un état partagé : la
     * passation est un écran indépendant, atteignable par son adresse, et un
     * état en mémoire disparaîtrait au premier rechargement. Le candidat verrait
     * alors une série de six sans savoir qu'il en avait demandé quinze.
     */
    const parametres = meta.short_of_scope
      ? `?demandees=${meta.requested}&servies=${meta.served}&resservies=${meta.already_mastered_reused}`
      : ''

    await navigateTo(localePath(`/app/tentative/${tentative.uuid}`) + parametres)
  } catch (e: unknown) {
    if (e instanceof ApiRequestError) erreur.value = e
    else throw e
  } finally {
    lancement.value = false
  }
}

useHead({ title: t('entrainement.titre') })
</script>

<template>
  <div class="enveloppe">
    <p class="oeil">{{ t('entrainement.oeil') }}</p>
    <h1 class="titre-page">{{ t('entrainement.titre') }}</h1>
    <p class="chapeau">{{ t('entrainement.intro') }}</p>

    <!-- L'état du compte n'a pas pu être lu : on ne peut ni proposer le geste
         — il serait refusé — ni annoncer un coût. On dit la panne, on ne la
         déguise pas en mur. -->
    <div v-if="!accesLu" class="alerte alerte--systeme" role="alert">
      <span>{{ t('app.etat_illisible') }}</span>
    </div>

    <!-- La série ciblée n'est pas dans l'accès : pas de formulaire, pas de
         bouton désactivé, pas de cadenas. Une issue, et rien d'autre. -->
    <AccesNonRendu v-else-if="!peutLancer" cle="entrainement.non_rendu" />

    <!-- Aucun domaine à travailler : ce n'est pas une panne, c'est un état. -->
    <div v-if="perimetreVide" class="alerte alerte--info" role="status">
      <span>{{ t('entrainement.perimetre_vide') }}</span>
    </div>

    <!-- Périmètre trop mince : le serveur dit combien il en faudrait. Aucune
         série vide n'est ouverte, et on ne complète pas hors périmètre. -->
    <div v-else-if="perimetreEtroit" class="alerte alerte--info" role="status">
      <span>
        {{ t('entrainement.perimetre_etroit', {
          available: etroitesse?.available ?? 0,
          minimum: etroitesse?.minimum ?? 0,
        }) }}
      </span>
    </div>

    <div v-else-if="erreur" class="alerte alerte--systeme" role="alert">
      <div>
        <span dir="auto">{{ erreur.message }}</span>
        <span v-if="erreur.error.request_id" class="alerte__reference">
          {{ t('errors.reference') }} {{ erreur.error.request_id }}
        </span>
      </div>
    </div>

    <!-- LE FORMULAIRE N'EXISTE QUE SI LE GESTE EST OUVERT. C'est la règle du
         lot : ce que le palier ne rend pas n'est pas dans le DOM. Les alertes
         de refus au-dessus ne sont, elles, atteignables qu'après un envoi —
         donc jamais quand le formulaire n'a pas été rendu. -->
    <form v-if="accesLu && peutLancer" class="config" novalidate @submit.prevent="lancer">
      <!-- LE CHOIX DU DOMAINE N'EXISTE QUE SI L'ORDONNANCE EST RENDUE.
           Sans `remediation.plan`, il n'y a pas de liste à proposer — et une
           légende « domaine » suivie d'une seule case « laisser Naja7i
           choisir » ferait croire à un choix qui n'en est pas un. Le serveur
           compose alors d'après ce qu'il sait, ce qu'il faisait déjà. -->
      <fieldset v-if="ordonnanceRendue" class="config__bloc">
        <legend class="config__titre">{{ t('entrainement.domaine') }}</legend>

        <label class="choix">
          <input v-model="domaineChoisi" type="radio" class="choix__radio" :value="null">
          <span class="choix__corps">
            <span class="choix__libelle">{{ t('entrainement.domaine_auto') }}</span>
            <span class="choix__aide">{{ t('entrainement.domaine_auto_aide') }}</span>
          </span>
        </label>

        <!-- Les lignes de l'ordonnance, avec leur motif : le candidat choisit
             en sachant POURQUOI ce domaine est proposé. -->
        <!-- `data-domaine` marque les choix dont le libellé VIENT DE L'API :
             ce sont ceux qui doivent porter `dir="auto"`, et les seuls. Le choix
             « laisser Naja7i choisir » est une chaîne traduite, déjà dans la
             langue de la page — lui poser `dir="auto"` n'aurait aucun effet et
             brouillerait la règle. -->
        <label
          v-for="ligne in domaines"
          :key="ligne.node_uuid"
          class="choix"
          :data-domaine="ligne.node_uuid"
        >
          <input
            v-model="domaineChoisi"
            type="radio"
            class="choix__radio"
            :value="ligne.node_uuid"
          >
          <span class="choix__corps">
            <span class="choix__libelle" dir="auto">{{ ligne.node_name }}</span>
            <span class="choix__aide">{{ t(`ordonnance.motif_${ligne.reason}`) }}</span>
          </span>
        </label>
      </fieldset>

      <div class="config__bloc">
        <label class="champ" for="nombre">
          <span class="champ__label">{{ t('entrainement.nombre') }}</span>
          <input
            id="nombre"
            v-model.number="total"
            class="champ__saisie config__nombre"
            type="number"
            min="5"
            max="40"
            step="1"
          >
          <!-- Bornes du contrat, dites plutôt que subies en 422. -->
          <span class="champ__aide">5 – 40</span>
        </label>
      </div>

      <p class="avertissement">{{ t('entrainement.pas_une_note') }}</p>

      <!-- LE COÛT, AVANT LE GESTE — S-10. Les nombres viennent du serveur ; la
           demande vient de la case juste au-dessus. Voir `CoutAnnonce` pour la
           seule arithmétique faite ici, et pourquoi le lot 3B l'autorise. -->
      <CoutAnnonce :enveloppe="enveloppe" :demande="total" />

      <button type="submit" class="btn btn--grand" :disabled="lancement || perimetreVide">
        {{ lancement ? t('entrainement.lancement') : t('entrainement.lancer') }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.config { max-inline-size: 44rem; }

.config__bloc {
  margin: 0 0 var(--e-5);
  padding: 0;
  border: 0;
}

.config__titre {
  padding: 0;
  margin-block-end: var(--e-3);
  font-size: var(--t-sm);
  font-weight: 700;
}

.choix {
  display: flex;
  gap: var(--e-3);
  align-items: flex-start;
  margin-block-end: var(--e-2);
  padding: var(--e-3) var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  cursor: pointer;
}

.choix:hover { border-color: var(--bordure-forte); }

.choix:has(.choix__radio:checked) {
  border-color: var(--accent);
  background: var(--accent-doux);
}

.choix__radio {
  flex: none;
  inline-size: 24px;
  block-size: 24px;
  margin: 0;
  accent-color: var(--accent);
}

.choix__corps { display: grid; gap: 2px; }
.choix__libelle { font-weight: 700; }
.choix__aide { font-size: var(--t-sm); color: var(--texte-doux); }

.config__nombre { max-inline-size: 8rem; }

.avertissement {
  max-inline-size: 60ch;
  margin-block: 0 var(--e-5);
  font-size: var(--t-sm);
  color: var(--peda-remede-texte);
}
</style>
