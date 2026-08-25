<script setup lang="ts">
definePageMeta({ layout: 'public' })

const route = useRoute()
const { t } = useI18n()
const localePath = useLocalePath()
const slug = route.params.famille as string

const api = useApi()
const { famille } = useCatalogue()
const { data: concours, error } = await famille(slug)

if (error.value || !concours.value) {
  throw erreurDeChargement(error.value, t('catalogue.introuvable'))
}

/**
 * Les épreuves ne sont pas exposées par l'endpoint de famille : chacune porte
 * sa propre matrice, chargée séparément. On ne demande que celles dont le code
 * est connu — pas de découverte à l'aveugle.
 */
const { data: epreuves } = await useAsyncData(
  `epreuves:${slug}`,
  async () => {
    const codes = concours.value?.exams?.map((e: { code: string }) => e.code) ?? []

    return Promise.all(
      codes.map(async (code) => {
        const reponse = await api.get<{ data: unknown[]; meta: Record<string, unknown> }>(
          `/catalogue/epreuves/${code}/competences`,
        )
        return { code, ...reponse }
      }),
    )
  },
  { default: () => [] },
)

/**
 * Domaines de premier niveau d'une matrice d'épreuve.
 *
 * Le gabarit portait ce filtre en ligne, annotations de type comprises — que le
 * compilateur de gabarits Vue n'accepte pas : `npm run typecheck` échouait sur
 * quatre erreurs de syntaxe. Le typage descend donc ici, où il est légitime, et
 * le gabarit ne fait plus qu'appeler.
 */
interface NoeudMatrice {
  code: string
  name: string
  depth: number
  weight_percent: number | null
}

function domainesRacines(noeuds: unknown): NoeudMatrice[] {
  if (!Array.isArray(noeuds)) {
    return []
  }

  return (noeuds as NoeudMatrice[]).filter((n) => n.depth === 0)
}

/** La disponibilité vient de la fiche de famille, jamais du succès de la
 * lecture de la matrice. Une matrice lisible peut avoir une banque vide. */
function diagnosticDisponible(code: string): boolean {
  return concours.value?.exams?.find(epreuve => epreuve.code === code)?.diagnostic_ready === true
}

useSeoCatalogue({
  title: concours.value.name,
  description: concours.value.description ?? t('catalogue.description_index'),
  path: `/concours/famille/${slug}`,
})
</script>

<template>
  <div v-if="concours" class="enveloppe section">
    <nav class="fil" :aria-label="t('catalogue.fil_ariane')">
      <NuxtLink :to="localePath('/')">{{ t('catalogue.accueil') }}</NuxtLink>
      <span aria-hidden="true">/</span>
      <NuxtLink v-if="concours.filiere" :to="localePath(`/concours/${concours.filiere.slug}`)">
        {{ concours.filiere.name }}
      </NuxtLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ concours.name }}</span>
    </nav>

    <p v-if="concours.authority" class="oeil">{{ concours.authority }}</p>
    <h1 class="titre-page">{{ concours.name }}</h1>
    <p v-if="concours.description" class="chapeau">{{ concours.description }}</p>

    <!-- Sessions : la date non confirmée est signalée, jamais tue. -->
    <section v-if="concours.sessions?.length" class="bloc">
      <h2 class="titre-bloc">{{ t('catalogue.sessions') }}</h2>
      <ul class="sessions">
        <li v-for="session in concours.sessions" :key="session.uuid" class="session">
          <div>
            <p class="session__label">{{ session.label }}</p>
            <p v-if="session.written_exam_on" class="session__date">
              {{ t('catalogue.ecrit_le') }} {{ session.written_exam_on }}
            </p>
          </div>
          <span v-if="!session.dates_confirmed" class="avis">
            {{ t('catalogue.dates_non_confirmees') }}
          </span>
        </li>
      </ul>
      <p v-if="concours.sessions.some((s) => !s.dates_confirmed)" class="note">
        {{ t('catalogue.note_dates') }}
      </p>
    </section>

    <section v-if="concours.specialties?.length" class="bloc">
      <h2 class="titre-bloc">{{ t('catalogue.specialites') }}</h2>
      <div class="grille grille--3">
        <CarteConcours
          v-for="specialite in concours.specialties"
          :key="specialite.uuid"
          :to="localePath(`/concours/famille/${slug}/${specialite.slug}`)"
          :titre="specialite.name"
          :meta="specialite.cycle"
          :texte="specialite.description"
          :disponibilite="specialite.availability"
        />
      </div>
    </section>

    <section v-if="epreuves?.length" class="bloc">
      <h2 class="titre-bloc">{{ t('catalogue.epreuves') }}</h2>
      <div class="grille grille--3">
        <CarteEpreuve
          v-for="epreuve in epreuves"
          :key="epreuve.code"
          :code="epreuve.code"
          :nom="String(epreuve.meta?.exam_name ?? epreuve.code)"
          :coefficient="Number(epreuve.meta?.coefficient) || null"
          :duree="Number(epreuve.meta?.duration_minutes) || null"
          :langues="(epreuve.meta?.languages_allowed as string[]) ?? null"
          :domaines="domainesRacines(epreuve.data)"
          :disponible="diagnosticDisponible(epreuve.code)"
        />
      </div>
      <p class="note">{{ t('catalogue.note_sources') }}</p>
    </section>
  </div>
</template>

<style scoped>
.bloc { margin-block-start: var(--e-6); }
.titre-bloc { font-size: var(--t-xl); margin-block-end: var(--e-3); }
.sessions { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--e-2); }
.session { display: flex; justify-content: space-between; gap: var(--e-3); align-items: center; flex-wrap: wrap;
  background: var(--surface); border: 1px solid var(--bordure); border-radius: var(--r); padding: var(--e-3) var(--e-4); }
.session__label { font-weight: 700; }
.session__date { font-size: var(--t-sm); color: var(--texte-doux); }
.avis { font-size: var(--t-xs); font-weight: 700; padding: 5px 11px; border-radius: 999px;
  background: var(--safran-50); color: var(--safran-800); border: 1px solid var(--safran-100); }
.note { margin-block-start: var(--e-3); font-size: var(--t-xs); color: var(--texte-doux); max-inline-size: 70ch; }
</style>
