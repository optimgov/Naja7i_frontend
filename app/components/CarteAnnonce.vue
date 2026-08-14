<script setup lang="ts">
import type { Annonce } from '~/composables/useOpportunites'

/**
 * Une annonce, en carte courte.
 *
 * LA NATURE N'EST PAS CODÉE PAR COULEUR. Huit natures — concours, poste de
 * responsabilité, stage, bourse, école, EAP… — n'ont aucune échelle de couleur
 * qui les distingue accessiblement, et un jeu de huit teintes aurait été joli
 * et illisible. La nature se lit par son NOM, écrit, dans une pastille neutre.
 *
 * AUCUN CODE D'ÉNUMÉRATION BRUT À L'ÉCRAN : `type`, `org_type` et `mode`
 * viennent du collecteur en `snake_case` et se traduisent. Une valeur inconnue
 * — le collecteur en ajoutera — se rabat sur le code lui-même plutôt que de
 * rendre une clé i18n crue à l'écran.
 *
 * `dir="auto"` sur TOUTE chaîne du collecteur : titre, organisme, résumé. Ces
 * chaînes sont en français dans la fixture, mais rien ne le garantit — et sur
 * une page arabe, une chaîne latine sans `dir` casse la ponctuation.
 */
const props = defineProps<{ annonce: Annonce, titreNiveau?: 2 | 3 }>()

const { t, te } = useI18n()
const localePath = useLocalePath()

const balise = computed(() => (props.titreNiveau === 2 ? 'h2' : 'h3'))

/** Libellé d'énumération, avec repli sur le code brut plutôt qu'une clé nue. */
function libelle(prefixe: string, code: string): string {
  const cle = `opportunites.${prefixe}_${code}`
  return te(cle) ? t(cle) : code
}

const nature = computed(() => libelle('type', props.annonce.type))

/**
 * Les faits saillants, dans l'ordre de ce qu'un candidat cherche d'abord.
 * Un fait absent DISPARAÎT — il ne vaut pas zéro, et « 0 poste » serait faux.
 */
const faits = computed(() => {
  const out: { cle: string, valeur: string }[] = []

  if (props.annonce.postes !== null) {
    /* PLURALISATION RÉELLE : « 1 poste », pas « 1 postes ». La source le fait,
     * et un pluriel faux sur la première carte d'un accueil se remarque.
     * `nombre()` pose la fine insécable de milliers — sans elle, « 4 200 » se
     * lit « 200 4 » en arabe. */
    out.push({
      cle: 'postes',
      valeur: t('opportunites.n_postes', props.annonce.postes, { named: { n: nombre(props.annonce.postes) } }),
    })
  }
  if (props.annonce.regions.length) {
    out.push({ cle: 'regions', valeur: props.annonce.regions.join(' · ') })
  }
  if (props.annonce.echelle) {
    out.push({ cle: 'echelle', valeur: t('opportunites.echelle_n', { n: props.annonce.echelle }) })
  }

  return out
})
</script>

<template>
  <article class="annonce">
    <!-- ORDRE DE LA SOURCE : rang (nature seule), titre, PUIS organisme.
         Ma première écriture mettait l'organisme dans le rang, à côté de la
         pastille : mesuré à 79 px de haut au lieu de 22, parce qu'un nom de
         ministère enroule sur trois lignes dans une colonne étroite. La
         maquette le pose sous le titre, où il dispose de toute la largeur. -->
    <div class="annonce__rang">
      <!-- Pastille NEUTRE : la nature se lit, elle ne se devine pas à la teinte. -->
      <span class="nature">{{ nature }}</span>
    </div>

    <component :is="balise" class="annonce__titre">
      <NuxtLink :to="localePath(`/opportunites/${annonce.slug}`)" dir="auto">
        {{ annonce.titre }}
      </NuxtLink>
    </component>

    <p class="annonce__org" dir="auto">{{ annonce.org }}</p>

    <!-- `<p>` + `<span>` comme la source, PAS une liste : un `<ul>` apporte ses
         puces et son retrait, que la maquette n'a jamais eus. Vu à la capture,
         pas au typage. -->
    <p v-if="faits.length" class="annonce__faits">
      <span v-for="fait in faits" :key="fait.cle" dir="auto">{{ fait.valeur }}</span>
    </p>

    <BlocEcheance :annonce="annonce" />

    <RattachementAnnonce :annonce="annonce" />
  </article>
</template>
