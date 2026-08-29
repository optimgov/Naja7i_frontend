<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

/**
 * E8 — les rendez-vous mémoire échus du jour.
 *
 * DEUX RÈGLES, ET ELLES SE RESSEMBLENT
 *
 * « Rien d'échu » n'est pas une erreur : la route rend une liste vide et la
 * date du prochain rendez-vous. « Rien aujourd'hui, prochain le 12 » dit au
 * candidat où il en est ; un écran vide lui laisse croire à une panne, et il
 * revient dix fois vérifier.
 *
 * Aucun plafond silencieux : le serveur en sert au plus vingt et annonce le
 * reste. « 20 aujourd'hui, 47 en attente » est une information ; cacher les 47
 * ferait croire au candidat qu'il a fini sa journée.
 *
 * L'ÉPREUVE N'EST PAS DANS LA ROUTE
 *
 * `/app/revisions` est une porte quotidienne, pas une page d'épreuve. Elle
 * résout l'épreuve suivie par l'index des tentatives — la même source que le
 * tableau de bord — et accepte `?epreuve=CODE` pour qui en suit plusieurs.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const route = useRoute()
const localePath = useLocalePath()
const { t, locale } = useI18n()
const { parcours, enCours, dernierePassee } = useParcours()
const { echeances, ouvrirSeance, riendEchu, sansQuestionSoeur, rendues } = useMemoire()

const { data: liste } = await parcours()
const tentatives = computed(() => liste.value?.data ?? [])

const code = computed(() => {
  const demande = route.query.epreuve
  if (typeof demande === 'string' && demande) return demande
  const suivie = enCours(tentatives.value) ?? dernierePassee(tentatives.value)
  return suivie?.exam.code ?? ''
})

const { data } = await useAsyncData(
  () => `revisions-${code.value || 'aucune'}`,
  async () => {
    if (!code.value) return null
    const { data: d } = await echeances(code)
    return d.value
  },
  { watch: [code] },
)

const rendezVous = computed(() => data.value?.data ?? [])
const meta = computed(() => data.value?.meta ?? null)

/**
 * LA SÉANCE MÉMOIRE A-T-ELLE ÉTÉ RENDUE ? — lot 3A.9
 *
 * Sans `memory.sessions`, la réponse ne porte NI liste NI compteur : ni
 * `due_total`, ni `pending`, ni `cap`, ni `next_due_on`. Les échéances restent
 * en base — elles sont l'histoire du candidat — mais rien n'en sort.
 *
 * Cet écran lisait `due_total ?? 0` et concluait « rien d'échu aujourd'hui,
 * plus aucun rendez-vous programmé ». Deux affirmations fausses, servies à
 * quelqu'un dont on ne savait rien, sous un bouton qui aurait répondu 403.
 *
 * On teste donc la PRÉSENCE du champ, et le zéro redevient ce qu'il est : une
 * bonne nouvelle.
 */
const echeancesRendues = computed(() => rendues(data.value))
const rienAujourdhui = computed(() => (meta.value?.due_total ?? 0) === 0)

const lancement = ref(false)
const erreur = ref<ApiRequestError | null>(null)
const prochaineApresRefus = ref<string | null>(null)

/** Date lisible dans la langue de l'interface, jamais un ISO brut à l'écran. */
function enClair(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat(locale.value === 'ar' ? 'ar-MA' : 'fr-MA', {
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso))
}

async function commencer(): Promise<void> {
  if (lancement.value) return
  lancement.value = true
  erreur.value = null
  prochaineApresRefus.value = null

  try {
    const { tentative } = await ouvrirSeance(code.value)
    await navigateTo(localePath(`/app/tentative/${tentative.uuid}`))
  } catch (e: unknown) {
    const rien = riendEchu(e)
    if (rien) {
      // Refus ATTENDU, pas une panne : le calendrier a bougé entre l'affichage
      // et le clic. On le dit comme une information.
      prochaineApresRefus.value = rien.prochaine
    } else if (e instanceof ApiRequestError) {
      erreur.value = e
    } else {
      throw e
    }
  } finally {
    lancement.value = false
  }
}

const banqueIncomplete = computed(() => sansQuestionSoeur(erreur.value))

useHead({ title: t('revisions.titre') })
</script>

<template>
  <div class="enveloppe">
    <p class="oeil">{{ t('revisions.oeil') }}</p>
    <h1 class="titre-page">{{ t('revisions.titre') }}</h1>
    <GuideEcran cle="revisions" />
    <p class="chapeau">{{ t('revisions.intro') }}</p>

    <div v-if="!code" class="alerte alerte--info" role="status">
      <span>{{ t('revisions.aucune_epreuve') }}</span>
    </div>

    <!-- Le serveur n'a rendu ni liste ni compteur : la séance mémoire n'est pas
         dans l'accès de ce compte. On n'invente ni « rien d'échu », ni « plus
         aucun rendez-vous », ni un bouton qui serait refusé. La page garde une
         issue — elle ne se termine jamais close. -->
    <AccesNonRendu v-else-if="!echeancesRendues" cle="revisions.non_rendues" />

    <template v-else>
      <!-- Rien d'échu : une information, pas un vide. La prochaine date en fait
           une phrase complète — « rien aujourd'hui, prochain le 12 ». -->
      <section v-if="rienAujourdhui" class="rien">
        <h2 class="rien__titre">{{ t('revisions.rien_titre') }}</h2>
        <p class="rien__texte">{{ t('revisions.rien_texte') }}</p>
        <p v-if="meta?.next_due_on" class="rien__prochain">
          {{ t('revisions.prochain', { date: enClair(meta.next_due_on) }) }}
        </p>
        <p v-else class="rien__prochain">{{ t('revisions.plus_de_rendez_vous') }}</p>
      </section>

      <template v-else>
        <!-- Aucun plafond silencieux : servis, en attente, et le plafond dit. -->
        <!-- Les `?? 0` de ce bloc ne fabriquent aucun chiffre : on n'y entre
             que si le serveur A RENDU le compte, et il les sert alors tous les
             six. Ils satisfont le typage, qui les déclare facultatifs parce
             qu'ils DISPARAISSENT ensemble hors de l'accès — cas traité plus
             haut, où rien de ceci n'est rendu. -->
        <ul v-if="meta" class="compte">
          <li class="compte__servis">{{ t('revisions.servis', { n: meta.served ?? 0 }) }}</li>
          <li v-if="(meta.pending ?? 0) > 0" class="compte__attente">
            {{ t('revisions.en_attente', { n: meta.pending ?? 0 }) }}
          </li>
          <li v-if="(meta.pending ?? 0) > 0" class="compte__plafond">
            {{ t('revisions.plafond', { n: meta.cap ?? 0 }) }}
          </li>
          <li v-if="(meta.without_sibling ?? 0) > 0" class="compte__sans">
            {{ t('revisions.sans_soeur', { n: meta.without_sibling ?? 0 }) }}
          </li>
        </ul>

        <p v-if="meta && (meta.without_sibling ?? 0) > 0" class="sans-soeur-aide">
          {{ t('revisions.sans_soeur_aide') }}
        </p>

        <ul class="rdv">
          <li v-for="r in rendezVous" :key="r.uuid" class="rdv__ligne">
            <div class="rdv__entete">
              <span class="rdv__domaine" dir="auto">{{ r.competency.name }}</span>
              <span class="rdv__palier">{{ t('revisions.palier', { n: r.palier }) }}</span>
            </div>

            <!-- La cause reste un champ payant ici comme ailleurs : servie si
                 déjà acquise, remplacée sinon. Jamais masquée en CSS. -->
            <p v-if="r.cause" class="rdv__cause">{{ t(`causes.${r.cause}`) }}</p>
            <p v-else-if="r.cause_locked" class="rdv__cause rdv__cause--fermee">
              {{ t('revisions.cause_fermee') }}
            </p>

            <p v-if="r.blind_error" class="rdv__certitude">
              <span aria-hidden="true">⚠</span> {{ t('revisions.erreur_certitude') }}
            </p>
          </li>
        </ul>

        <div v-if="prochaineApresRefus !== null" class="alerte alerte--info" role="status">
          <span>
            {{ t('revisions.rien_titre') }} —
            {{ prochaineApresRefus
              ? t('revisions.prochain', { date: enClair(prochaineApresRefus) })
              : t('revisions.plus_de_rendez_vous') }}
          </span>
        </div>

        <div v-else-if="banqueIncomplete" class="alerte alerte--info" role="status">
          <span dir="auto">{{ erreur?.message }}</span>
        </div>

        <div v-else-if="erreur" class="alerte alerte--systeme" role="alert">
          <div>
            <span dir="auto">{{ erreur.message }}</span>
            <span v-if="erreur.error.request_id" class="alerte__reference">
              {{ t('errors.reference') }} {{ erreur.error.request_id }}
            </span>
          </div>
        </div>

        <button type="button" class="btn btn--grand" :disabled="lancement" @click="commencer">
          {{ lancement ? t('revisions.lancement') : t('revisions.lancer') }}
        </button>
      </template>
    </template>
  </div>
</template>

<style scoped>
.rien {
  max-inline-size: 44rem;
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-inline-start: 3px solid var(--peda-juste);
  border-radius: var(--r);
}

.rien__titre { margin-block: 0 var(--e-2); font-size: var(--t-lg); font-weight: 800; }
.rien__texte { margin-block: 0 var(--e-3); color: var(--texte-doux); }
.rien__prochain { margin: 0; font-weight: 600; }

.compte {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-4);
  margin: 0 0 var(--e-3);
  padding: 0;
  list-style: none;
  font-size: var(--t-sm);
}

.compte__servis { font-weight: 700; }
.compte__attente { color: var(--peda-remede-texte); font-weight: 600; }
.compte__plafond,
.compte__sans { color: var(--texte-doux); }

.sans-soeur-aide {
  max-inline-size: 60ch;
  margin-block: 0 var(--e-4);
  font-size: var(--t-xs);
  color: var(--texte-doux);
}

.rdv { display: grid; gap: var(--e-2); margin: 0 0 var(--e-5); padding: 0; list-style: none; }

.rdv__ligne {
  padding: var(--e-3) var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.rdv__entete {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  align-items: baseline;
  justify-content: space-between;
}

.rdv__domaine { font-weight: 700; }
.rdv__palier { font-size: var(--t-xs); color: var(--texte-doux); }
.rdv__cause { margin: var(--e-1) 0 0; font-size: var(--t-sm); color: var(--peda-faux-texte); }
.rdv__cause--fermee { color: var(--peda-remede-texte); }
.rdv__certitude { margin: var(--e-1) 0 0; font-size: var(--t-xs); color: var(--texte-doux); }
</style>
