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
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { ouvrirEntrainement } = useTentative()
const { ordonnance } = useOrdonnance()

const codeEpreuve = computed(() => String(route.params.epreuve ?? ''))

/* Les domaines proposés SONT les lignes de l'ordonnance. On ne recompose pas
 * une liste : ce serait un second classement, qui finirait par diverger. */
const { data: plan } = await ordonnance(codeEpreuve, 20)
const domaines = computed(() => plan.value?.data ?? [])

/** `null` = laisser le serveur choisir. C'est la valeur par défaut. */
const domaineChoisi = ref<string | null>(null)
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

    <form class="config" novalidate @submit.prevent="lancer">
      <fieldset class="config__bloc">
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
