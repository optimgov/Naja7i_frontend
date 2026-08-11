<script setup lang="ts">
/**
 * Marque Naja7i.
 *
 * POURQUOI LE TRACÉ EST INLINE ET NON UN `<img src="/logo/…">`
 *
 * Une image externe ne connaît ni `currentColor` ni le thème : il faudrait
 * deux fichiers, puis quatre avec le sombre, et un jour l'un des quatre
 * divergerait. Inline, la tuile suit les jetons et la bascule sombre sans
 * qu'aucun fichier ne soit à tenir à jour.
 *
 * Les fichiers de `public/logo/` existent quand même — ils sont la version
 * autonome, pour la favicon, les partages et les e-mails, contextes où aucun
 * CSS du site n'est chargé. Le tracé y est identique, et c'est la seule chose
 * qui doit le rester : le commentaire de chaque fichier le dit.
 *
 * TAILLE
 *
 * `--h` fixe la hauteur de la tuile, tout le reste en découle : le mot est
 * dimensionné en `em` relatifs à cette hauteur. Un seul nombre à régler, donc
 * pas de dérive entre la tuile et le texte. Défaut 28 px.
 */
withDefaults(
  defineProps<{
    /** Sur fond sombre : tuile claire, texte clair. */
    inverse?: boolean
    /** Tuile seule, sans le mot — barres de navigation étroites, favicons. */
    compact?: boolean
  }>(),
  { inverse: false, compact: false },
)
</script>

<template>
  <span class="logo" :class="{ 'logo--inverse': inverse, 'logo--compact': compact }">
    <svg
      class="logo__tuile"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="32" height="32" rx="7" class="logo__fond" />
      <path
        d="M9.5 10.5H22.5L14.5 23.5"
        class="logo__sept"
        stroke-width="3.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>

    <!-- Le mot n'est pas une image : il doit rester sélectionnable, traduisible
         par le navigateur, et lisible par un lecteur d'écran. En `compact`, il
         reste dans le DOM en lecture d'écran seule — la marque garde son nom
         accessible même réduite à sa tuile. -->
    <span class="logo__mot">naja<span class="logo__sept-lettre">7</span>i<em>.ma</em></span>
  </span>
</template>

<style scoped>
.logo {
  --h: 28px;

  display: inline-flex;
  align-items: center;
  gap: 0.32em;
  font-size: var(--h);
  line-height: 1;
  color: var(--texte);
  text-decoration: none;
  white-space: nowrap;
}

.logo__tuile {
  flex: none;
  inline-size: 1em;
  block-size: 1em;
}

.logo__fond { fill: var(--vert-700); }
.logo__sept { stroke: var(--safran-600); }

.logo--inverse { color: var(--texte-inverse); }
.logo--inverse .logo__fond { fill: var(--sable-0); }
.logo--inverse .logo__sept { stroke: var(--vert-700); }

.logo__mot {
  font-family: var(--f-latine);
  font-size: 0.62em;
  font-weight: 800;
  letter-spacing: -0.03em;
}

/* Le 7 du mot porte le safran, comme le tracé de la tuile : c'est le seul
   accent coloré de la marque.

   `--marque-accent` (commun.css) suit le thème — le safran lisible sur surface
   claire ne l'est pas sur surface sombre. En inverse, la surface est le vert
   profond du panneau quel que soit le thème : la valeur y est donc fixe.
   Mesuré sur --vert-800 : --safran-600 rend 4,18:1, sous le seuil ;
   --safran-500 rend 5,30:1. */
.logo__sept-lettre { color: var(--marque-accent); }
.logo--inverse .logo__sept-lettre { color: var(--safran-500); }

.logo__mot em {
  font-style: normal;
  font-weight: 600;
  opacity: 0.55;
}

/* En compact le mot sort du flux sans sortir de l'arbre d'accessibilité. */
.logo--compact .logo__mot {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
