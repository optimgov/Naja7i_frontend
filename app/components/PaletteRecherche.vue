<script setup lang="ts">
import type { EntreeRecherche } from '~/composables/useRecherche'

/**
 * La palette de recherche — elle répond à une intention, elle ne décore pas
 * l'en-tête.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE DOIT FAIRE AU CLAVIER, ET POURQUOI CHAQUE POINT COMPTE
 *
 *   Flèches      parcourent les résultats SANS quitter le champ de saisie. Un
 *                candidat continue de taper pour affiner ; le focus DOM reste
 *                donc dans l'input et c'est `aria-activedescendant` qui déplace
 *                le focus VIRTUEL. C'est le motif « combobox » de l'ARIA, et
 *                c'est le seul qui permette les deux gestes à la fois.
 *   Entrée       ouvre le résultat actif.
 *   Échap        ferme et REND LE FOCUS au déclencheur. Sans ce retour, on
 *                ferme la palette et l'on se retrouve au début du document.
 *   aria-live    annonce le nombre de résultats. Une liste qui se remplit en
 *                silence n'existe pas pour qui ne la voit pas.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA LISTE N'EXISTE PAS QUAND ELLE EST VIDE
 *
 * `v-if`, jamais `v-show` : une `listbox` vide laissée dans l'arbre est
 * annoncée comme une liste — de rien.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX ÉTATS D'ABSENCE, ET ILS NE DISENT PAS LA MÊME CHOSE
 *
 *   AUCUN RÉSULTAT       les corpus ont répondu, rien ne correspond. On le dit,
 *                        avec deux portes de sortie.
 *   SOURCE MANQUANTE     le catalogue n'a pas répondu. Affirmer « aucun
 *                        résultat » serait FAUX : la vérité est « nous n'avons
 *                        pas pu chercher partout », et `meta.sources` la porte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FRAPPE EST TEMPORISÉE, PAS LA RÉPONSE
 *
 * 180 ms — assez pour ne pas interroger à chaque touche, assez peu pour que la
 * liste semble suivre la main. Et chaque réponse porte le NUMÉRO de sa
 * question : deux requêtes lancées à 40 ms d'intervalle ne reviennent pas
 * forcément dans l'ordre, et une réponse en retard écraserait une liste plus
 * récente par des résultats périmés.
 */
const { t, te } = useI18n()
const localePath = useLocalePath()

const declencheur = ref<HTMLElement | null>(null)
const panneau = ref<HTMLElement | null>(null)
const saisie = ref<HTMLInputElement | null>(null)
const { ouvert, basculer, fermer } = usePanneau('recherche', { declencheur, panneau })

const { chercher, grouper } = useRecherche()

const question = ref('')
const resultats = ref<EntreeRecherche[]>([])
const sources = ref({ catalogue: false, opportunites: false })
const tropCourt = ref(true)
const total = ref(0)
const enCours = ref(false)
const indexActif = ref(0)

let minuterie: ReturnType<typeof setTimeout> | null = null
let numero = 0

const groupes = computed(() => grouper(resultats.value))

/** La liste APLATIE, dans l'ordre où l'œil la parcourt — c'est elle que les
 *  flèches suivent, pas l'ordre brut du serveur. */
const parcours = computed(() => groupes.value.flatMap((g) => g.entrees))

const idActif = computed(() =>
  parcours.value.length ? `resultat-${indexActif.value}` : undefined,
)

/** Le catalogue n'a pas répondu : on ne peut pas affirmer « aucun résultat ». */
const partielle = computed(() => !tropCourt.value && !sources.value.catalogue)

watch(question, (valeur) => {
  if (minuterie) clearTimeout(minuterie)

  minuterie = setTimeout(async () => {
    const mien = ++numero
    enCours.value = true

    try {
      const reponse = await chercher(valeur)

      /* Une réponse en retard n'écrase pas une liste plus récente. */
      if (mien !== numero) return

      resultats.value = reponse.data
      sources.value = reponse.meta.sources
      tropCourt.value = reponse.meta.trop_court
      total.value = reponse.meta.total
      indexActif.value = 0
    } catch {
      /* Une panne de la route d'agrégation ne fabrique pas « aucun résultat » :
         elle rend l'état « nous n'avons pas pu chercher », qui est exact. */
      if (mien !== numero) return
      resultats.value = []
      sources.value = { catalogue: false, opportunites: false }
      tropCourt.value = false
      total.value = 0
    } finally {
      if (mien === numero) enCours.value = false
    }
  }, 180)
})

/* Ouverte, la palette prend le focus sur sa saisie : c'est là qu'on va. */
watch(ouvert, (estOuvert) => {
  if (estOuvert) nextTick(() => saisie.value?.focus())
})

function deplacer(pas: number): void {
  if (!parcours.value.length) return
  const n = parcours.value.length
  indexActif.value = (indexActif.value + pas + n) % n
}

async function ouvrirActif(): Promise<void> {
  const entree = parcours.value[indexActif.value]
  if (!entree) return

  fermer(false)
  await navigateTo(localePath(entree.chemin))
}

/** L'état se LIT. Aucun code d'énumération brut à l'écran. */
function etat(entree: EntreeRecherche): string {
  if (!entree.etat) return ''

  const cle = entree.type === 'opportunite'
    ? `recherche.etat_${entree.etat}`
    : `catalogue.dispo_${entree.etat}`

  return te(cle) ? t(cle) : ''
}

onBeforeUnmount(() => {
  if (minuterie) clearTimeout(minuterie)
})
</script>

<template>
  <div class="recherche-globale">
    <button
      ref="declencheur"
      type="button"
      class="recherche-globale__declencheur"
      :aria-expanded="ouvert"
      aria-controls="palette-recherche"
      @click="basculer"
    >
      <span class="recherche-globale__icone" aria-hidden="true">⌕</span>
      <span class="recherche-globale__mot">{{ t('recherche.ouvrir') }}</span>
    </button>

    <div
      v-if="ouvert"
      id="palette-recherche"
      ref="panneau"
      class="palette"
      role="dialog"
      aria-modal="false"
      :aria-label="t('recherche.titre')"
    >
      <div class="palette__cadre">
        <!--
          `role="combobox"` sur la SAISIE, `aria-activedescendant` pour le
          curseur virtuel : les flèches parcourent les résultats sans que le
          focus DOM quitte le champ, donc sans interrompre la frappe.
        -->
        <input
          ref="saisie"
          v-model="question"
          type="search"
          class="palette__saisie"
          role="combobox"
          aria-controls="palette-resultats"
          aria-autocomplete="list"
          :aria-expanded="parcours.length > 0"
          :aria-activedescendant="idActif"
          :placeholder="t('recherche.indice')"
          :aria-label="t('recherche.titre')"
          @keydown.down.prevent="deplacer(1)"
          @keydown.up.prevent="deplacer(-1)"
          @keydown.enter.prevent="ouvrirActif"
        >

        <!-- LE COMPTE EST ANNONCÉ. Une liste qui se remplit en silence n'existe
             pas pour qui ne la voit pas. -->
        <p class="palette__compte" role="status" aria-live="polite">
          <span v-if="tropCourt">{{ t('recherche.trop_court', { n: 2 }) }}</span>
          <span v-else-if="enCours">{{ t('recherche.en_cours') }}</span>
          <span v-else>{{ t('recherche.n_resultats', total, { named: { n: total } }) }}</span>
        </p>

        <ul
          v-if="parcours.length"
          id="palette-resultats"
          class="palette__liste"
          role="listbox"
          :aria-label="t('recherche.titre')"
        >
          <template v-for="groupe in groupes" :key="groupe.type">
            <li class="palette__groupe" role="presentation">
              {{ t(`recherche.groupe_${groupe.type}`) }}
            </li>

            <li
              v-for="entree in groupe.entrees"
              :id="`resultat-${parcours.indexOf(entree)}`"
              :key="entree.chemin"
              class="palette__resultat"
              :class="{ 'palette__resultat--actif': parcours.indexOf(entree) === indexActif }"
              role="option"
              :aria-selected="parcours.indexOf(entree) === indexActif"
            >
              <NuxtLink :to="localePath(entree.chemin)" @click="fermer(false)">
                <span class="palette__titre" dir="auto">{{ entree.titre }}</span>
                <span v-if="entree.contexte" class="palette__contexte" dir="auto">
                  {{ entree.contexte }}
                </span>
                <span v-if="etat(entree)" class="palette__etat">{{ etat(entree) }}</span>
              </NuxtLink>
            </li>
          </template>
        </ul>

        <!-- LE CATALOGUE N'A PAS RÉPONDU : on ne dit pas « aucun résultat », qui
             serait faux. On dit ce qui s'est passé. -->
        <div v-else-if="partielle" class="palette__vide">
          <p>{{ t('recherche.source_manquante') }}</p>
        </div>

        <div v-else-if="!tropCourt && !enCours" class="palette__vide">
          <p>{{ t('recherche.aucun') }}</p>
          <div class="palette__portes">
            <NuxtLink class="lien-second" :to="localePath('/concours')" @click="fermer(false)">
              {{ t('catalogue.concours') }}
            </NuxtLink>
            <NuxtLink class="lien-second" :to="localePath('/opportunites')" @click="fermer(false)">
              {{ t('opportunites.titre') }}
            </NuxtLink>
          </div>
        </div>

        <!-- La page complète, quand la palette ne suffit plus. Elle porte la
             question dans son URL, donc elle se partage et se recharge. -->
        <p v-if="!tropCourt && total > parcours.length" class="palette__tout">
          <NuxtLink
            class="lien-second"
            :to="{ path: localePath('/recherche'), query: { q: question } }"
            @click="fermer(false)"
          >
            {{ t('recherche.tout_voir', { n: total }) }}
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
