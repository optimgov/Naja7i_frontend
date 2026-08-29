<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

/**
 * E9 — le SEUIL de l'examen blanc.
 *
 * ON NE LANCE PAS UN EXAMEN BLANC PAR ACCIDENT.
 *
 * C'est la seule série du produit qui engage le candidat pour plusieurs heures
 * sans pause possible, avec une échéance que le serveur fait respecter. Un
 * bouton « lancer » posé sur un tableau de bord suffirait à ouvrir une épreuve
 * de quatre heures d'un clic distrait — et la fermer coûterait une simulation
 * expirée, comptée dans la maîtrise. D'où cet écran, dont le seul travail est
 * de dire ce qui attend AVANT de proposer d'entrer.
 *
 * CE QU'IL ANNONCE VIENT DU RÉFÉRENTIEL, PAS D'UNE LISTE ÉCRITE ICI.
 *
 * La durée, les domaines et leurs poids sont lus sur la route publique du
 * catalogue — la MÊME matrice que le serveur utilise pour composer la série.
 * Une liste recopiée dans cet écran dériverait au premier changement de
 * référentiel, et le seuil annoncerait une épreuve que le simulateur ne
 * compose plus.
 *
 * CE QU'IL N'ANNONCE PAS : un barème. Le descriptif officiel ne le donne pas
 * (`official_scoring_note`), et le produit préfère écrire « non précisé » que
 * de combler. C'est la règle « aucun chiffre fabriqué », appliquée à l'endroit
 * où elle coûte le plus cher.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()
const { referentielEpreuve } = useCatalogue()
const { ouvrirSimulation } = useTentative()
const { acces } = useAcces()

const codeEpreuve = computed(() => String(route.params.epreuve ?? ''))

/*
 * ─────────────────── LE MUR EST UN CHAMP, ET ICI IL FERME UN GESTE ──────────
 *
 * `simulator.full` ne ferme aucune lecture : le seuil se lit du référentiel
 * public, et le rapport d'un examen blanc DÉJÀ passé ne porte aucun mur (lot
 * 3A.9). Elle ferme l'OUVERTURE d'une nouvelle épreuve, et le serveur la
 * refuse en 403 nommé.
 *
 * L'écran ne rendait donc pas ce refus — le commentaire d'origine disait « pas
 * de bouton désactivé pour cause de droits », ce qui était vrai, mais le
 * bouton était bien là et menait au 403. Il n'est plus rendu du tout.
 */
const { lu: accesLu, ouvre, enveloppeDe } = await acces()

const peutLancer = computed(() => ouvre(CAPACITE.EXAMEN_BLANC))

/**
 * L'enveloppe de composition. `demande` reste nulle : c'est le référentiel qui
 * fixe le nombre de questions d'un examen blanc, pas le candidat. On annonce
 * donc le reliquat, et pas un coût qu'on ne connaît pas — l'inventer serait
 * exactement ce que la règle interdit.
 */
const enveloppe = computed(() => enveloppeDe(CAPACITE.REPONDRE))

const { data: referentiel, error: erreurReferentiel } = await referentielEpreuve(codeEpreuve.value)

/* `useAsyncData` place `undefined` dans `error`, pas `null` : on teste la
 * véracité, sinon la condition est toujours vraie et le repli s'affiche en
 * permanence. Piège documenté du dépôt. */
const referentielIllisible = computed(() => Boolean(erreurReferentiel.value) || !referentiel.value)

const epreuve = computed(() => referentiel.value?.meta.exam ?? null)

/**
 * Les SECTIONS annoncées sont les domaines PONDÉRÉS, à plat.
 *
 * L'arbre porte des parents qui pèsent la somme de leurs feuilles : les
 * afficher tous ferait un total de 200 %. Le composeur du serveur ne retient
 * que les feuilles (`depth > 0`), et cet écran doit annoncer la même chose.
 */
const sections = computed(() => {
  const plat: { code: string, name: string, weight_percent: number }[] = []

  const parcourir = (noeuds: { code: string, name: string, depth: number, weight_percent: number | null, children?: unknown[] }[]): void => {
    for (const noeud of noeuds) {
      const enfants = (noeud.children ?? []) as typeof noeuds
      if (enfants.length > 0) parcourir(enfants)
      else if (noeud.depth > 0 && noeud.weight_percent !== null) {
        plat.push({ code: noeud.code, name: noeud.name, weight_percent: noeud.weight_percent })
      }
    }
  }

  parcourir((referentiel.value?.data ?? []) as never)

  return plat.sort((a, b) => b.weight_percent - a.weight_percent)
})

/** La durée officielle, en heures et minutes. Nulle si non établie. */
const duree = computed(() => {
  const m = epreuve.value?.duration_minutes
  if (m === null || m === undefined) return null
  const h = Math.floor(m / 60)
  const reste = m % 60
  return { heures: h, minutes: reste, total: m }
})

const lancement = ref(false)
const erreur = ref<ApiRequestError | null>(null)

const dureeInconnue = computed(
  () => erreur.value?.error.code === 'SIMULATION_DURATION_UNKNOWN' || duree.value === null,
)
const banqueInsuffisante = computed(() => erreur.value?.error.code === 'SIMULATION_NOT_AVAILABLE')

/**
 * Lance, ou reprend.
 *
 * Le serveur tranche : 201 s'il crée, 200 s'il rend celle déjà ouverte. Le
 * bouton est verrouillé pendant l'appel — c'est la première des deux gardes
 * contre le double clic, la seconde étant la clé d'idempotence portée par
 * `ouvrirSimulation`. Deux clics ouvrent donc UNE simulation, et la recette
 * le vérifie.
 */
async function lancer(): Promise<void> {
  if (lancement.value) return
  lancement.value = true
  erreur.value = null

  try {
    const tentative = await ouvrirSimulation(codeEpreuve.value)
    await navigateTo(localePath(`/app/tentative/${tentative.uuid}`))
  }
  catch (e: unknown) {
    if (e instanceof ApiRequestError) erreur.value = e
    else throw e
  }
  finally {
    lancement.value = false
  }
}

useHead({ title: () => t('simulation.titre') })
</script>

<template>
  <div class="enveloppe">
    <p class="oeil">{{ t('simulation.oeil') }}</p>
    <h1 class="titre">{{ t('simulation.titre') }}</h1>
    <GuideEcran cle="simulation" />

    <p v-if="epreuve" class="epreuve" dir="auto">{{ epreuve.name }}</p>

    <!-- Le référentiel est illisible : la donnée DISPARAÎT, elle ne vaut pas
         zéro. Annoncer « 0 domaine » serait une affirmation fausse. -->
    <div v-if="referentielIllisible" class="alerte alerte--systeme" role="alert">
      <span>{{ t('simulation.referentiel_illisible') }}</span>
    </div>

    <template v-else>
      <p class="intro">{{ t('simulation.intro') }}</p>

      <!-- ─────────── Ce que l'examen blanc reproduit ─────────── -->
      <section class="bloc">
        <h2 class="bloc__titre">{{ t('simulation.reproduit_titre') }}</h2>

        <dl class="faits">
          <div class="fait">
            <dt class="fait__cle">{{ t('simulation.duree') }}</dt>
            <dd v-if="duree" class="fait__valeur">
              <!-- « 4 h 0 » n'est pas une durée : quand les minutes sont
                   nulles, on n'écrit que les heures. -->
              <template v-if="duree.heures > 0 && duree.minutes === 0">
                {{ t('simulation.duree_h', { h: duree.heures }) }}
              </template>
              <template v-else-if="duree.heures > 0">
                {{ t('simulation.duree_h_min', { h: duree.heures, min: duree.minutes }) }}
              </template>
              <template v-else>
                {{ t('simulation.duree_min', { min: duree.total }) }}
              </template>
            </dd>
            <dd v-else class="fait__valeur fait__valeur--absent">
              {{ t('simulation.non_precise') }}
            </dd>
          </div>

          <div class="fait">
            <dt class="fait__cle">{{ t('simulation.sections') }}</dt>
            <dd class="fait__valeur">{{ t('simulation.sections_n', { n: sections.length }) }}</dd>
          </div>

          <div class="fait">
            <dt class="fait__cle">{{ t('simulation.bareme') }}</dt>
            <!-- Le barème officiel n'est pas public. On l'écrit, on ne le
                 comble pas : c'est là que « aucun chiffre fabriqué » coûte le
                 plus cher. -->
            <dd class="fait__valeur fait__valeur--absent">{{ t('simulation.bareme_non_officiel') }}</dd>
          </div>
        </dl>

        <p class="poids__intro">{{ t('simulation.poids_intro') }}</p>

        <ul class="poids">
          <li v-for="section in sections" :key="section.code" class="poids__ligne">
            <span class="poids__nom" dir="auto">{{ section.name }}</span>
            <span class="poids__part">{{ t('simulation.pourcent', { n: section.weight_percent }) }}</span>
            <span class="poids__jauge" aria-hidden="true">
              <span class="poids__remplissage" :style="{ inlineSize: `${section.weight_percent}%` }" />
            </span>
          </li>
        </ul>
      </section>

      <!-- ─────────── Les conditions ─────────── -->
      <section class="bloc bloc--conditions">
        <h2 class="bloc__titre">{{ t('simulation.conditions_titre') }}</h2>

        <ul class="conditions">
          <li class="condition">
            <span class="condition__marque" aria-hidden="true">⏱</span>
            <span>
              <strong>{{ t('simulation.condition_chrono_titre') }}</strong>
              {{ t('simulation.condition_chrono_texte') }}
            </span>
          </li>
          <li class="condition">
            <span class="condition__marque" aria-hidden="true">⛔</span>
            <span>
              <strong>{{ t('simulation.condition_pause_titre') }}</strong>
              {{ t('simulation.condition_pause_texte') }}
            </span>
          </li>
          <li class="condition">
            <span class="condition__marque" aria-hidden="true">👁</span>
            <span>
              <strong>{{ t('simulation.condition_correction_titre') }}</strong>
              {{ t('simulation.condition_correction_texte') }}
            </span>
          </li>
          <li class="condition">
            <span class="condition__marque" aria-hidden="true">✓</span>
            <span>
              <strong>{{ t('simulation.condition_une_seule_titre') }}</strong>
              {{ t('simulation.condition_une_seule_texte') }}
            </span>
          </li>
        </ul>
      </section>

      <div v-if="banqueInsuffisante" class="alerte alerte--info" role="status">
        <span>{{ t('simulation.banque_insuffisante') }}</span>
      </div>

      <div v-else-if="dureeInconnue" class="alerte alerte--info" role="status">
        <span>{{ t('simulation.duree_inconnue') }}</span>
      </div>

      <div v-else-if="erreur" class="alerte alerte--systeme" role="alert">
        <div>
          <span dir="auto">{{ erreur.message }}</span>
          <span v-if="erreur.error.request_id" class="alerte__reference">
            {{ t('errors.reference') }} {{ erreur.error.request_id }}
          </span>
        </div>
      </div>

      <!-- L'état n'a pas pu être lu : on le dit plutôt que de proposer un geste
           qu'on n'a pas pu vérifier. -->
      <div v-if="!accesLu" class="alerte alerte--systeme" role="alert">
        <span>{{ t('app.etat_illisible') }}</span>
      </div>

      <!-- L'examen blanc n'est pas dans l'accès. Le SEUIL reste lisible — il
           dit ce que l'épreuve est, et cette lecture n'a jamais été murée —
           mais le geste n'est pas rendu. Ni bouton désactivé, ni cadenas. -->
      <AccesNonRendu v-else-if="!peutLancer" cle="simulation.non_rendu" />

      <template v-else-if="!dureeInconnue">
        <!-- LE COÛT, AVANT LE GESTE. Le référentiel fixe le nombre de
             questions : on annonce le reliquat, jamais un coût supposé. -->
        <CoutAnnonce :enveloppe="enveloppe" :demande="null" />

        <!-- Le verrou du bouton est celui de l'ENVOI en cours, qui est un état
             de la requête et non un droit. -->
        <button type="button" class="btn btn--grand" :disabled="lancement" @click="lancer">
          {{ lancement ? t('simulation.lancement') : t('simulation.lancer') }}
        </button>
      </template>

      <p class="avertissement">{{ t('simulation.avant_de_lancer') }}</p>
    </template>
  </div>
</template>

<style scoped>
.oeil {
  margin: 0 0 var(--e-1);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--texte-doux);
}

.titre { margin-block: 0 var(--e-2); font-size: var(--t-2xl); font-weight: 800; }
.epreuve { margin-block: 0 var(--e-4); font-size: var(--t-lg); color: var(--texte-doux); }
.intro { margin-block: 0 var(--e-5); line-height: 1.6; }

.bloc {
  margin-block-end: var(--e-5);
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r-m);
}

.bloc__titre { margin-block: 0 var(--e-4); font-size: var(--t-lg); font-weight: 700; }

.faits { display: grid; gap: var(--e-3); margin: 0 0 var(--e-5); }

@media (min-width: 42rem) {
  .faits { grid-template-columns: repeat(3, 1fr); }
}

.fait {
  padding: var(--e-3);
  background: var(--surface-douce);
  border-radius: var(--r);
}

.fait__cle {
  margin: 0 0 var(--e-1);
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--texte-doux);
}

.fait__valeur { margin: 0; font-size: var(--t-lg); font-weight: 700; }

/* Une absence n'est pas un chiffre : elle se lit autrement. */
.fait__valeur--absent {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--texte-doux);
}

.poids__intro { margin-block: 0 var(--e-3); font-size: var(--t-sm); color: var(--texte-doux); }

.poids { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--e-2); }

.poids__ligne {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--e-1) var(--e-3);
  align-items: baseline;
}

.poids__nom { font-size: var(--t-sm); }
.poids__part { font-size: var(--t-sm); font-weight: 700; font-family: var(--mono); }

.poids__jauge {
  grid-column: 1 / -1;
  block-size: 4px;
  border-radius: 999px;
  background: var(--surface-douce);
  overflow: hidden;
}

.poids__remplissage { display: block; block-size: 100%; background: var(--accent); }

.bloc--conditions { border-color: var(--bordure-forte); }

.conditions { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--e-3); }

.condition { display: grid; grid-template-columns: auto 1fr; gap: var(--e-3); align-items: start; }

/* La marque est décorative : le sens est porté par les mots qui suivent,
   jamais par le seul pictogramme. */
.condition__marque { font-size: var(--t-lg); line-height: 1.4; }

.condition strong { display: block; }

.avertissement {
  margin-block-start: var(--e-3);
  font-size: var(--t-sm);
  color: var(--texte-doux);
}
</style>
