<script setup lang="ts">
import type { Annonce } from '~/composables/useOpportunites'

/**
 * La fiche d'une annonce — rendue par le SERVEUR, avec son JSON-LD.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI LE SSR N'EST PAS NÉGOCIABLE ICI
 *
 * Cette page EST le levier d'acquisition. Un `JobPosting` posé par le
 * navigateur après hydratation n'est pas vu par la plupart des collecteurs de
 * données structurées, et une fiche d'emploi sans données structurées ne sort
 * pas dans Google for Jobs. Tout ce qui compte pour l'indexation est donc dans
 * le HTML servi — titre, résumé, `validThrough`.
 *
 * `validThrough` EST EXACT, et c'est le champ qui décide de tout : une annonce
 * dont la date est passée sort d'elle-même des résultats. La fausser d'un jour
 * fait apparaître un concours clos, ou disparaître un concours ouvert.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE RÉSUMÉ EST RÉDIGÉ, PAS RECOPIÉ
 *
 * Republier la prose de l'avis officiel ferait de cette page un doublon que
 * Google n'afficherait jamais — et priverait le candidat de la seule chose que
 * naja7i ajoute : une lecture. Le résumé vient du collecteur, construit à
 * partir des CHAMPS de l'avis. La page le dit.
 *
 * L'HISTORIQUE DES RÉVISIONS est la pièce qu'aucun autre agrégateur ne garde.
 * Une échéance repoussée ou un nombre de postes corrigé y apparaît DATÉ, au
 * lieu d'être écrasé en silence.
 */
definePageMeta({ layout: 'public' })

const { t, te, locale } = useI18n()
const route = useRoute()
const localePath = useLocalePath()

const { annonces } = useOpportunites()
const { data: charge } = await annonces()

const slug = computed(() => String(route.params.slug ?? ''))

const annonce = computed<Annonce | null>(
  () => charge.value?.data.find(a => a.slug === slug.value) ?? null,
)

/* Slug inconnu → 404 RENDU PAR LE SERVEUR. Une page vide répondant 200 se
 * ferait indexer comme une fiche valide. */
if (!annonce.value) {
  throw createError({ statusCode: 404, statusMessage: 'Annonce introuvable', fatal: true })
}

const a = computed(() => annonce.value!)
const echeance = computed(() => echeanceDe(a.value))
const rattachement = computed(() => rattachementDe(a.value))

function libelle(prefixe: string, code: string | null): string {
  if (!code) return ''
  const cle = `opportunites.${prefixe}_${code}`
  return te(cle) ? t(cle) : code
}

/** Dates en clair. Chiffres latins en arabe — voir `nombre()` et D-F54. */
function enClair(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(locale.value === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-MA', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/** Les faits, dans l'ordre de ce qu'un candidat vérifie. Un absent disparaît. */
const faits = computed(() => {
  const out: { cle: string, valeur: string, texte?: boolean }[] = []
  const x = a.value

  if (x.postes !== null) out.push({ cle: 'postes', valeur: nombre(x.postes) })
  if (x.echelle) out.push({ cle: 'echelle', valeur: x.echelle })
  if (x.grade) out.push({ cle: 'grade', valeur: x.grade, texte: true })
  if (x.deadline) out.push({ cle: 'depot', valeur: enClair(x.deadline), texte: true })
  if (x.exam) out.push({ cle: 'epreuves', valeur: enClair(x.exam), texte: true })
  if (x.age !== null) out.push({ cle: 'age', valeur: t('opportunites.n_ans', { n: x.age }) })

  out.push({ cle: 'mode', valeur: libelle('mode', x.mode), texte: true })

  return out
})

const versPreparation = computed(() =>
  a.value.naja7i.prep_slug ? localePath(`/concours/famille/${a.value.naja7i.prep_slug}`) : null,
)

/**
 * `JobPosting` — POSÉ CÔTÉ SERVEUR.
 *
 * `description` reprend notre résumé rédigé, pas la prose de la source.
 * `validThrough` porte l'échéance EXACTE, horaire compris : c'est ce champ qui
 * fait sortir l'annonce des résultats le jour venu.
 *
 * `hiringOrganization` est l'ADMINISTRATION, jamais naja7i : nous agrégeons,
 * nous ne recrutons pas. S'y déclarer serait faux, et Google le sanctionne.
 */
const jsonLd = computed(() => {
  const x = a.value

  const donnees: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    'title': x.titre,
    'description': x.resume,
    'datePosted': x.publie,
    'identifier': {
      '@type': 'PropertyValue',
      'name': x.source.nom,
      'value': x.ref ?? x.id,
    },
    'hiringOrganization': {
      '@type': 'Organization',
      'name': x.org,
    },
    'employmentType': 'FULL_TIME',
    'jobLocationType': undefined,
  }

  if (x.deadline) donnees.validThrough = x.deadline

  if (x.regions.length) {
    donnees.jobLocation = x.regions.map(r => ({
      '@type': 'Place',
      'address': { '@type': 'PostalAddress', 'addressRegion': r, 'addressCountry': 'MA' },
    }))
  }

  if (x.diplomes.length) {
    donnees.qualifications = x.diplomes.join(', ')
  }

  return donnees
})

useHead({
  script: [{ type: 'application/ld+json', innerHTML: computed(() => JSON.stringify(jsonLd.value)) }],
})

useSeoCatalogue({
  title: a.value.titre,
  description: a.value.resume.slice(0, 160),
  path: `/opportunites/${slug.value}`,
})
</script>

<template>
  <div class="enveloppe fiche">
    <div dir="auto">
      <!-- Le fil d'Ariane du dépôt (`.fil`), pas celui de la maquette : un seul
           système, celui qui existait. -->
      <ol class="fil">
        <li><NuxtLink :to="localePath('/')">{{ t('navigation.barre_accueil') }}</NuxtLink></li>
        <li><NuxtLink :to="localePath('/opportunites')">{{ t('opportunites.titre') }}</NuxtLink></li>
        <li aria-current="page" dir="auto">{{ a.titre }}</li>
      </ol>

      <div class="annonce__rang">
        <span class="nature">{{ libelle('type', a.type) }}</span>
        <span class="nature">{{ libelle('stage', a.stage) }}</span>
        <span v-if="a.ref" class="nature">{{ a.ref }}</span>
      </div>

      <h1 dir="auto">{{ a.titre }}</h1>
      <p class="fiche__org" dir="auto">{{ a.org }}</p>

      <RattachementAnnonce :annonce="a" />

      <div class="fiche__faits">
        <div v-for="fait in faits" :key="fait.cle" class="fiche__fait">
          <p class="fiche__fait-cle">{{ t(`opportunites.fait_${fait.cle}`) }}</p>
          <p class="fiche__fait-val" :class="{ 'fiche__fait-val--texte': fait.texte }" dir="auto">
            {{ fait.valeur }}
          </p>
        </div>
      </div>

      <h2>{{ t('opportunites.en_resume') }}</h2>
      <p class="fiche__resume" dir="auto">{{ a.resume }}</p>
      <p class="fiche__note">{{ t('opportunites.resume_note') }}</p>

      <template v-if="a.specialites.length">
        <h2>{{ t('opportunites.specialites') }}</h2>
        <div class="fiche__puces">
          <span v-for="s in a.specialites" :key="s" class="nature" dir="auto">{{ s }}</span>
        </div>
      </template>

      <template v-if="a.diplomes.length">
        <h2>{{ t('opportunites.diplomes') }}</h2>
        <div class="fiche__puces">
          <span v-for="d in a.diplomes" :key="d" class="nature" dir="auto">{{ d }}</span>
        </div>
      </template>

      <!-- L'HISTORIQUE — la pièce qu'aucun autre agrégateur ne garde. -->
      <h2>{{ t('opportunites.historique') }}</h2>
      <div class="fiche__revisions">
        <p class="revision">
          <span class="revision__quand">{{ enClair(a.source.fetched) }}</span>
          <span dir="auto">{{ t('opportunites.revision_collecte', { n: a.revision }) }}</span>
        </p>
        <p class="revision">
          <span class="revision__quand">{{ enClair(a.source.fetched) }}</span>
          <span dir="auto">
            {{ t('opportunites.revision_rattachement', {
              filiere: a.naja7i.filiere ? libelle('filiere', a.naja7i.filiere) : t('opportunites.filiere_aucune'),
              motif: a.naja7i.match_reason ?? t('opportunites.motif_defaut'),
              confiance: String(a.naja7i.confidence).replace('.', ','),
            }) }}
          </span>
        </p>
      </div>
      <p class="fiche__note">{{ t('opportunites.historique_note') }}</p>

      <!-- LA SOURCE. Seul l'avis officiel fait foi — un agrégateur qui ne le dit
           pas laisse croire qu'il est la source. -->
      <div class="source">
        <p class="source__ligne">
          <span dir="auto">{{ t('opportunites.source_nom', { nom: a.source.nom }) }}</span>
          <span>{{ t('opportunites.source_collecte', { date: enClair(a.source.fetched) }) }}</span>
        </p>
        <p>{{ t('opportunites.source_foi') }}</p>
      </div>
    </div>

    <aside class="fiche__cote">
      <div class="action">
        <BlocEcheance :annonce="a" />

        <template v-if="rattachement === 'prepare' && versPreparation">
          <h2 class="action__titre">{{ t('opportunites.action_prepare_titre') }}</h2>
          <p class="action__note">{{ t('opportunites.action_prepare_note') }}</p>
          <NuxtLink class="btn btn--bloc" :to="versPreparation">
            {{ t('opportunites.action_prepare_bouton') }}
          </NuxtLink>
        </template>

        <!-- Le dépôt de cette session est clos, la préparation ne l'est pas.
             LE BOUTON RESTE : se préparer quand le dépôt vient de fermer est
             même le meilleur moment pour s'y mettre. C'est la NOTE qui porte la
             nuance, pas la présence du chemin. -->
        <template v-else-if="rattachement === 'prepare_clos' && versPreparation">
          <h2 class="action__titre">{{ t('opportunites.action_prepare_clos_titre') }}</h2>
          <p class="action__note">{{ t('opportunites.action_prepare_clos_note') }}</p>
          <NuxtLink class="btn btn--bloc" :to="versPreparation">
            {{ t('opportunites.action_prepare_bouton') }}
          </NuxtLink>
        </template>

        <!-- Pas de préparation : on le DIT, et on ne propose pas de liste
             d'attente — cette route n'existe pas, et un bouton qui mène à un
             404 est pire que pas de bouton. -->
        <template v-else>
          <h2 class="action__titre">{{ t('opportunites.action_attente_titre') }}</h2>
          <p class="action__note">{{ t('opportunites.action_attente_note') }}</p>
        </template>

        <a class="btn btn--fantome btn--bloc" :href="a.url" rel="noopener nofollow">
          {{ t('opportunites.action_officiel') }}
        </a>

        <p class="action__note">
          <a v-if="a.docs.length" :href="a.docs[0]!.url" rel="noopener nofollow" dir="auto">
            {{ a.docs[0]!.label }}
          </a>
          <span v-else>{{ t('opportunites.aucun_document') }}</span>
        </p>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.fiche__org { font-size: var(--t-lg); color: var(--texte-doux); }
.fiche__resume { color: var(--texte-doux); max-inline-size: 64ch; }
.fiche__note {
  font-size: var(--t-sm);
  color: var(--texte-doux);
  max-inline-size: 64ch;
  margin-block-start: var(--e-2);
}
.fiche__puces { display: flex; flex-wrap: wrap; gap: var(--e-2); }
.fiche__revisions {
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r-m);
}
</style>
