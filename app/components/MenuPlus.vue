<script setup lang="ts">
/**
 * Le menu « Plus » — ce qui ne tient pas dans cinq cibles, sur téléphone.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IL NE CONTIENT QUE DES ROUTES QUI RÉPONDENT
 *
 * Le cahier prévoit d'y ranger « Tarifs, Annales si disponibles, Guides si
 * publiés, langue, thème et liens légaux ». Trois de ces six n'existent pas :
 * ni `/annales`, ni `/guides`, ni les pages légales — le contrat
 * `/legal/documents` sert `kind, version, locale, title, summary,
 * document_url…` et AUCUN corps de texte, ses documents sont marqués
 * provisoires, et DET-07 bloque leur publication avant validation juridique.
 *
 * Un menu « Plus » qui promet trois portes fermées est pire qu'un menu court :
 * il apprend au candidat que nos liens ne mènent nulle part, et il le lui
 * apprend sur le premier menu qu'il ouvre. On n'y met que ce qui répond 200.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA BASCULE DE THÈME N'ENTRE PAS ICI, ET C'EST DÉLIBÉRÉ
 *
 * Elle reste dans le rang du haut, à toutes les largeurs. `npm run audit`
 * rejoue chaque écran en thème sombre en CLIQUANT `[data-bascule-theme]` : une
 * bascule enfermée dans un panneau fermé ne serait pas cliquable, le clic
 * échouerait en silence — `auditer.mjs` l'entoure d'un `.catch(() => {})` — et
 * la passe « sombre » mesurerait le thème clair en le déclarant conforme.
 *
 * Autrement dit : y ranger le thème rendrait l'audit sombre muet sur tous les
 * écrans à 390 px. C'est exactement le faux vert que le lot précédent a corrigé
 * ailleurs, et il ne se réintroduit pas par une question de rangement.
 *
 * La langue, elle, y entre : aucun contrôle automatique ne dépend de son
 * emplacement, et `switchLocalePath` reste un lien ordinaire.
 */
const { t, locale, locales } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()

const declencheur = ref<HTMLElement | null>(null)
const panneau = ref<HTMLElement | null>(null)
const { ouvert, basculer } = usePanneau('menu-plus', { declencheur, panneau })

const autre = computed(() => (locale.value === 'fr' ? 'ar' : 'fr'))
const nomAutre = computed(
  () => locales.value.find((l: { code: string }) => l.code === autre.value)?.name ?? '',
)
</script>

<template>
  <div class="plus">
    <button
      ref="declencheur"
      type="button"
      class="plus__declencheur"
      :aria-expanded="ouvert"
      aria-controls="menu-plus"
      @click="basculer"
    >
      <span class="plus__icone" aria-hidden="true">☰</span>
      <span>{{ t('navigation.plus') }}</span>
    </button>

    <!-- `v-if` et non `v-show` : masqué en CSS, ce menu resterait dans l'arbre
         d'accessibilité et la tabulation le traverserait à l'aveugle. -->
    <div
      v-if="ouvert"
      id="menu-plus"
      ref="panneau"
      class="plus__panneau"
      :aria-label="t('navigation.plus')"
      role="group"
    >
      <ul class="plus__liste">
        <li>
          <NuxtLink class="plus__lien" :to="localePath('/se-preparer')">
            {{ t('navigation.se_preparer') }}
          </NuxtLink>
        </li>
        <li>
          <NuxtLink class="plus__lien" :to="localePath('/tarifs')">
            {{ t('pied.tarifs') }}
          </NuxtLink>
        </li>
        <li>
          <NuxtLink class="plus__lien" :to="localePath('/robot')">
            {{ t('pied.robot') }}
          </NuxtLink>
        </li>
        <li>
          <NuxtLink class="plus__lien" :to="switchLocalePath(autre)" :lang="autre">
            {{ nomAutre }}
          </NuxtLink>
        </li>
      </ul>
    </div>
  </div>
</template>
