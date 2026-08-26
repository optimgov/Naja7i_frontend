<script setup lang="ts">
definePageMeta({ layout: 'public', middleware: 'preparation' })

const route = useRoute()
const { t, locale } = useI18n()
const localePath = useLocalePath()
const { vers } = useLienEspaceCandidat()
const famille = route.params.famille as string
const slug = route.params.specialite as string

const { specialite } = useCatalogue()
const { data: matiere, error } = await specialite(famille, slug)

if (error.value || !matiere.value) {
  throw erreurDeChargement(error.value, t('catalogue.introuvable'))
}

useSeoCatalogue({
  title: matiere.value.name,
  description: matiere.value.description ?? t('catalogue.description_index'),
  path: `/concours/famille/${famille}/${slug}`,
})

const ouverte = computed(() => matiere.value?.availability === 'open')

/* `open` publie la fiche pilote ; il ne prouve pas que la banque porte une
 * correction. La porte vers l'accueil n'existe que si l'API en sert une. */
const api = useApi()
const { data: demonstration, error: erreurDemonstration } = await useAsyncData(
  () => `demonstration:disponibilite:${locale.value}`,
  () => api.get<{ data: unknown }>('/demonstration/correction', { locale: locale.value }),
  { watch: [locale] },
)
const demonstrationDisponible = computed(() =>
  !erreurDemonstration.value
  && contientQuestionDemonstration(demonstration.value?.data),
)

/*
 * L'ENCART « CONCOURS OUVERTS » — P6.
 *
 * Il ferme la boucle du lot : la zone publique agrège des annonces, et c'est
 * SUR LA PAGE DE PRÉPARATION qu'elles prennent leur sens. Un candidat qui lit
 * « Mathématiques » doit voir que le concours correspondant ferme dans six
 * jours, sans avoir à retourner au tapis.
 *
 * LE RATTACHEMENT VIENT DU COLLECTEUR, pas d'une correspondance de texte sur
 * le nom de la spécialité. `naja7i.prep_slug` est le champ prévu pour cela :
 * il désigne soit toute la famille, soit cette spécialité précise. Le champ
 * générique `filiere` ne suffit pas — il ferait remonter ici tous les concours
 * de l'éducation, même ceux d'une autre matière.
 *
 * TROIS AU PLUS, les plus proches. L'encart annonce, il ne remplace pas le
 * tapis — qui est à un clic.
 */
const { annonces } = useOpportunites()
const { data: charge, error: erreurAnnonces } = await annonces()

/** Les deux rattachements recevables : famille entière ou spécialité exacte. */
const familleVisee = computed(() => matiere.value?.family?.slug ?? famille)
const specialiteVisee = computed(() => `${familleVisee.value}/${slug}`)

const concoursOuverts = computed(() => {
  if (erreurAnnonces.value || !charge.value) return []

  return charge.value.data
    .filter(a => estOuverte(a))
    .filter(a =>
      a.naja7i.prep_slug === familleVisee.value
      || a.naja7i.prep_slug === specialiteVisee.value,
    )
    .sort((x, y) => (x.jours ?? 9999) - (y.jours ?? 9999))
    /* PLAFOND ASSUMÉ, ET C'EST CE QUI LE REND HONNÊTE — M-021, pas 3.
     *
     * Trois annonces, les plus proches de leur clôture. Ce bloc est un aperçu,
     * pas une liste : le lien « toutes les opportunités » le suit
     * immédiatement dans le gabarit, et mène au listing complet avec ses
     * filtres. Un plafond dont la sortie est offerte n'est pas un plafond
     * muet — le silence seul est interdit. */
    .slice(0, 3)
})
</script>

<template>
  <div v-if="matiere" class="enveloppe section">
    <nav class="fil" :aria-label="t('catalogue.fil_ariane')">
      <NuxtLink :to="localePath('/')">{{ t('catalogue.accueil') }}</NuxtLink>
      <span aria-hidden="true">/</span>
      <NuxtLink :to="vers(`/concours/famille/${famille}`)">
        {{ matiere.family?.name ?? famille }}
      </NuxtLink>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ matiere.name }}</span>
    </nav>

    <p v-if="matiere.cycle" class="oeil">{{ matiere.cycle }}</p>
    <h1 class="titre-page">{{ matiere.name }}</h1>
    <p v-if="matiere.description" class="chapeau">{{ matiere.description }}</p>

    <!--
      Une spécialité en liste d'attente ne propose jamais de diagnostic :
      critère de recette de NAJA7I-ZP-001 §9.
    -->
    <!-- `/methode/correction` N'EXISTE PAS, et ce bouton y menait encore. Le
         FRONT-1 avait corrigé le même lien sur l'accueil en le remplaçant par
         une ancre vers la démonstration, qui est la correction expliquée qu'il
         promet ; la page de spécialité était restée en arrière. -->
    <div v-if="ouverte && demonstrationDisponible" class="actes">
      <NuxtLink class="btn btn--grand" :to="`${localePath('/')}#demonstration`">
        {{ t('catalogue.voir_correction') }}
      </NuxtLink>
    </div>
    <div v-else-if="!ouverte" class="attente">
      <p>{{ t('catalogue.specialite_en_attente') }}</p>
    </div>

    <!-- L'encart n'apparaît QUE s'il a quelque chose à dire. Un bloc « aucun
         concours ouvert » sur une page de préparation démoralise sans informer :
         l'absence d'annonce aujourd'hui ne dit rien du concours de l'an
         prochain. -->
    <section v-if="concoursOuverts.length" class="encart-ouverts">
      <div class="encart-ouverts__entete">
        <h2 class="encart-ouverts__titre">{{ t('catalogue.ouverts_titre') }}</h2>
        <NuxtLink class="lien-second" :to="localePath('/opportunites')">
          {{ t('catalogue.ouverts_tout_voir') }}
        </NuxtLink>
      </div>

      <div class="encart-ouverts__grille">
        <CarteAnnonce
          v-for="a in concoursOuverts"
          :key="a.id"
          :annonce="a"
          :titre-niveau="3"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.actes { margin-block-start: var(--e-5); }
.attente { margin-block-start: var(--e-5); padding: var(--e-4);
  background: var(--fond); border: 1px solid var(--bordure); border-radius: var(--r);
  font-size: var(--t-sm); color: var(--texte-doux); max-inline-size: 60ch; }
</style>
