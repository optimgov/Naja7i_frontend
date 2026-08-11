<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * Page d'erreur — 404 et 500, dans les deux langues.
 *
 * LE 404 EST STRUCTURANT, PAS DÉCORATIF
 *
 * La règle du produit est « 404, jamais 403 » : une ressource à laquelle un
 * candidat n'a pas droit n'existe pas pour lui. Cette page est donc ce que
 * voit quelqu'un qui touche la tentative d'un autre compte — pas seulement
 * quelqu'un qui s'est trompé d'adresse.
 *
 * D'où deux interdits :
 *
 *  1. Aucun clin d'œil du type « ou alors vous n'y avez pas droit ». Il
 *     reconstituerait le 403 en français : le lecteur apprendrait que la
 *     ressource existe, ce que le 404 a précisément pour objet de taire.
 *  2. Aucune impasse. La page propose une sortie — l'accueil, le catalogue —
 *     parce qu'un candidat qui tombe ici au milieu d'une révision doit pouvoir
 *     y retourner sans repasser par la barre d'adresse.
 *
 * LA LANGUE VIENT DU CHEMIN
 *
 * `error.vue` est rendue hors du système de routes : aucune route n'a été
 * résolue, donc la locale déduite de la route ne l'est pas non plus. Sur
 * `/ar/…`, `useI18n()` retomberait sur le français et servirait une page
 * d'erreur française à un lecteur arabophone. On lit donc le préfixe du
 * chemin, qui est la seule information fiable ici.
 */
const props = defineProps<{ error: NuxtError }>()

const { t, locale, setLocale } = useI18n()
const route = useRoute()

const languePath = computed<'fr' | 'ar'>(() =>
  /^\/ar(\/|$)/.test(route.fullPath) ? 'ar' : 'fr',
)

if (locale.value !== languePath.value) await setLocale(languePath.value)

useHead({
  htmlAttrs: {
    lang: () => languePath.value,
    dir: () => (languePath.value === 'ar' ? 'rtl' : 'ltr'),
  },
})

/*
 * Tout ce qui n'est pas un 404 est traité comme une panne : un candidat n'a pas
 * à connaître la différence entre un 500, un 502 et un délai dépassé, et
 * énumérer les codes ne l'aiderait en rien.
 */
const introuvable = computed(() => props.error?.statusCode === 404)

/* `useError` conserve l'erreur ; `clearError` la vide ET navigue. Sans elle, le
 * lien ramènerait à l'accueil en laissant la page d'erreur montée. */
function sortir(vers: string): void {
  clearError({ redirect: `/${languePath.value}${vers}` })
}

const titre = computed(() => (introuvable.value ? t('erreur.introuvable_titre') : t('erreur.panne_titre')))

useSeoMeta({ title: () => titre.value, robots: 'noindex' })
</script>

<template>
  <div class="erreur">
    <main class="erreur__contenu">
      <NuxtLink :to="`/${languePath}`" class="erreur__marque" :aria-label="t('erreur.retour_accueil')">
        <LogoNaja7i />
      </NuxtLink>

      <p class="oeil">{{ introuvable ? t('erreur.introuvable_oeil') : t('erreur.panne_oeil') }}</p>

      <h1 class="erreur__titre">{{ titre }}</h1>

      <p class="erreur__texte">
        {{ introuvable ? t('erreur.introuvable_texte') : t('erreur.panne_texte') }}
      </p>

      <div class="erreur__sorties">
        <button type="button" class="btn" @click="sortir('')">
          {{ t('erreur.retour_accueil') }}
        </button>
        <button type="button" class="lien-second" @click="sortir('/concours')">
          {{ t('erreur.voir_concours') }}
        </button>
      </div>

      <!-- L'identifiant de requête sert au support, pas au candidat : il est
           présent, en retrait, et seulement quand le serveur en a fourni un. -->
      <p v-if="!introuvable && error?.statusCode" class="erreur__reference">
        {{ t('errors.reference') }} {{ error.statusCode }}
      </p>
    </main>
  </div>
</template>

<style scoped>
.erreur {
  display: grid;
  place-items: center;
  min-block-size: 100dvh;
  padding: var(--e-5) var(--e-4);
  background: var(--fond);
}

.erreur__contenu {
  inline-size: 100%;
  max-inline-size: 34rem;
  text-align: center;
}

.erreur__marque {
  display: inline-flex;
  margin-block-end: var(--e-6);
  text-decoration: none;
}

.erreur__titre {
  margin-block: 0 var(--e-3);
  font-size: var(--t-2xl);
  font-weight: 800;
  line-height: 1.15;
  color: var(--texte);
}

.erreur__texte {
  margin-block: 0 var(--e-5);
  font-size: var(--t-lg);
  line-height: 1.6;
  color: var(--texte-doux);
}

.erreur__sorties {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--e-4);
}

/* Le lien secondaire est un <button> — il ne navigue pas, il vide l'erreur.
   Il doit donc perdre l'apparence de bouton natif que `.lien-second` ne
   neutralise pas, cette classe ayant été écrite pour des ancres. */
.erreur__sorties .lien-second {
  font: inherit;
  font-size: var(--t-sm);
  font-weight: 600;
  background: none;
  border: 0;
  cursor: pointer;
}

.erreur__reference {
  margin-block-start: var(--e-6);
  font-family: var(--mono);
  font-size: var(--t-2xs);
  color: var(--texte-tenu);
}
</style>
