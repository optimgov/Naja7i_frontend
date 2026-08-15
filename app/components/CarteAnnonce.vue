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
/*
 * LE NOMBRE DE POSTES EST EN GRAISSE, PAR UN CRÉNEAU — pas par du HTML en
 * message.
 *
 * La source écrit `<b>${nb(a.postes)}</b> poste(s)`, et c'est le bon effet : le
 * nombre est ce qu'on cherche des yeux sur une carte d'annonce. Mais la règle
 * du dépôt interdit le HTML dans les messages i18n — le compilateur le refuse,
 * et c'est une surface d'injection. « L'emphase passe par des créneaux de
 * composant. »
 *
 * `<i18n-t>` est exactement ce créneau : le message reste du TEXTE, avec son
 * `{n}` et son pluriel, et le gabarit décide de la graisse. La règle tient, la
 * graisse revient.
 *
 * Ce fait est donc rendu à part des autres, qui n'ont pas d'emphase.
 */
const autresFaits = computed(() => {
  const out: { cle: string, valeur: string }[] = []

  if (props.annonce.regions.length) {
    out.push({ cle: 'regions', valeur: props.annonce.regions.join(' · ') })
  }
  if (props.annonce.echelle) {
    out.push({ cle: 'echelle', valeur: t('opportunites.echelle_n', { n: props.annonce.echelle }) })
  }

  return out
})

const aDesFaits = computed(() => props.annonce.postes !== null || autresFaits.value.length > 0)
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
    <p v-if="aDesFaits" class="annonce__faits">
      <!-- `<i18n-t>` : le message reste du texte, le gabarit pose la graisse.
           `:plural` conserve « 1 poste » contre « 40 postes ». -->
      <i18n-t
        v-if="annonce.postes !== null"
        keypath="opportunites.n_postes"
        tag="span"
        :plural="annonce.postes"
        scope="global"
      >
        <template #n><b>{{ nombre(annonce.postes) }}</b></template>
      </i18n-t>

      <span v-for="fait in autresFaits" :key="fait.cle" dir="auto">{{ fait.valeur }}</span>
    </p>

    <BlocEcheance :annonce="annonce" />

    <RattachementAnnonce :annonce="annonce" />
  </article>
</template>
