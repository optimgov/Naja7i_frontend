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
 *
 * ET LE THÈME VIENT D'ICI AUSSI, POUR LA MÊME RAISON
 *
 * Cette page ne remplace pas seulement une route : elle remplace `app.vue`. La
 * racine de Nuxt monte `<ErrorComponent v-else-if="error">`, donc l'appel unique
 * à `useThemeApplique()` de `app.vue` n'a jamais été exécuté ici. L'attribut
 * `data-theme` manquait : un candidat ayant choisi le sombre recevait cette
 * page en clair, et une passe d'audit « sombre » y mesurait le thème clair sans
 * s'en apercevoir. C'est le seul écran du produit qui avait ce trou, parce que
 * c'est le seul qui ne passe pas par `app.vue`.
 */
const props = defineProps<{ error: NuxtError }>()

const { t, locale, setLocale } = useI18n()
const route = useRoute()

const languePath = computed<'fr' | 'ar'>(() =>
  /^\/ar(\/|$)/.test(route.fullPath) ? 'ar' : 'fr',
)

if (locale.value !== languePath.value) await setLocale(languePath.value)

useThemeApplique()

useHead({
  htmlAttrs: {
    lang: () => languePath.value,
    dir: () => (languePath.value === 'ar' ? 'rtl' : 'ltr'),
  },
})

/*
 * Tout ce qui n'est ni un 404 ni un 403 est traité comme une panne : un
 * candidat n'a pas à connaître la différence entre un 500, un 502 et un délai
 * dépassé, et énumérer les codes ne l'aiderait en rien.
 */
const introuvable = computed(() => props.error?.statusCode === 404)

/**
 * D-13 — UN REFUS N'EST PAS UNE PANNE, et le confondre coûte deux fois.
 *
 * Cette page rangeait le 403 avec les 500 : « Une panne est survenue de notre
 * côté », suivi de « Référence 403 ». Les deux phrases sont fausses. Rien n'est
 * en panne, rien n'est de notre côté, et le lecteur repart en croyant qu'il
 * suffit de réessayer.
 *
 * LA RÈGLE DU DÉPÔT N'EST PAS CONTREDITE. « 404, jamais 403 » vise
 * l'ÉNUMÉRATION des ressources d'autrui : une tentative, une commande, un
 * profil qui appartient à quelqu'un d'autre reste INTROUVABLE, et aucun écran
 * candidat ne produit de 403. Un 403 qui parvient jusqu'ici est donc, par
 * construction, un refus de PERMISSION — et le refusé sait déjà que la surface
 * existe, puisqu'il vient d'en demander une qu'il connaît.
 *
 * CE QU'ON NE PEUT PAS DIRE ICI, ET POURQUOI ON NE L'INVENTE PAS. La permission
 * manquante voyage dans `details.required` de la réponse d'API, que cette page
 * ne reçoit pas : `error.vue` est rendue hors du système de routes, avec le
 * seul `statusCode`. Nommer la permission demanderait de la faire voyager
 * jusqu'ici — c'est une dette ouverte (DET-79), pas un repli à fabriquer. On
 * nomme donc ce qu'on sait : que c'est un refus de permission, sur QUELLE
 * adresse, et à qui la demander.
 */
const refuse = computed(() => props.error?.statusCode === 403)

/** L'adresse refusée, sans les paramètres — c'est la surface, pas la requête. */
const surface = computed(() => route.fullPath.split(/[?#]/)[0] ?? '')

/* `useError` conserve l'erreur ; `clearError` la vide ET navigue. Sans elle, le
 * lien ramènerait à l'accueil en laissant la page d'erreur montée. */
function sortir(vers: string): void {
  clearError({ redirect: `/${languePath.value}${vers}` })
}

const titre = computed(() => {
  if (introuvable.value) return t('erreur.introuvable_titre')
  if (refuse.value) return t('erreur.refuse_titre')
  return t('erreur.panne_titre')
})

const oeil = computed(() => {
  if (introuvable.value) return t('erreur.introuvable_oeil')
  if (refuse.value) return t('erreur.refuse_oeil')
  return t('erreur.panne_oeil')
})

const texte = computed(() => {
  if (introuvable.value) return t('erreur.introuvable_texte')
  if (refuse.value) return t('erreur.refuse_texte')
  return t('erreur.panne_texte')
})

useSeoMeta({ title: () => titre.value, robots: 'noindex' })
</script>

<template>
  <div class="erreur">
    <!-- LA BASCULE EXISTE ICI COMME AILLEURS. Elle manquait au seul écran qui
         ne passe pas par `app.vue`, si bien qu'un candidat en thème sombre n'y
         avait aucun moyen de revenir au clair — et que la passe sombre de
         `npm run audit` cliquait un sélecteur absent, échouait en silence, puis
         mesurait le thème clair en l'étiquetant « sombre ». -->
    <div class="erreur__barre">
      <BasculeTheme />
    </div>

    <main class="erreur__contenu">
      <NuxtLink :to="`/${languePath}`" class="erreur__marque" :aria-label="t('erreur.retour_accueil')">
        <LogoNaja7i />
      </NuxtLink>

      <p class="oeil">{{ oeil }}</p>

      <h1 class="erreur__titre">{{ titre }}</h1>

      <p class="erreur__texte">{{ texte }}</p>

      <!-- LA SURFACE EST NOMMÉE. C'est la moitié du D-13 que cette page peut
           tenir : le refusé sait quelle adresse lui est fermée, et peut la
           citer à qui il la demande. -->
      <p v-if="refuse" class="erreur__surface">
        <span class="erreur__surface-libelle">{{ t('erreur.refuse_surface') }}</span>
        <code class="erreur__surface-valeur" dir="ltr">{{ surface }}</code>
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
           présent, en retrait, et seulement quand le serveur en a fourni un.
           Pas sur un refus : « Référence 403 » sous un texte qui dit déjà
           « permission refusée » n'ajoute rien et sonne comme un incident. -->
      <p v-if="!introuvable && !refuse && error?.statusCode" class="erreur__reference">
        {{ t('errors.reference') }} {{ error.statusCode }}
      </p>
    </main>
  </div>
</template>

<style scoped>
/* Deux rangées : la commande en haut, le message centré dans ce qui reste.
   `place-items: center` sur une grille à un seul enfant tenait tant qu'il n'y
   en avait qu'un ; la bascule aurait été centrée avec le message. */
.erreur {
  display: grid;
  grid-template-rows: auto 1fr;
  min-block-size: 100dvh;
  padding: var(--e-5) var(--e-4);
  background: var(--fond);
}

.erreur__barre {
  display: flex;
  justify-content: flex-end;
}

.erreur__contenu {
  align-self: center;
  justify-self: center;
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

.erreur__surface {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  align-items: baseline;
  justify-content: center;
  margin-block: 0 var(--e-5);
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

.erreur__surface-libelle { font-weight: 700; }

.erreur__surface-valeur {
  font-family: var(--mono);
  font-size: var(--t-xs);
  padding: 2px 8px;
  border-radius: var(--r);
  background: var(--surface-douce);
  color: var(--texte);
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
