<script setup lang="ts">
/**
 * Interrupteur clair / sombre.
 *
 * `data-bascule-theme` n'est pas décoratif : c'est le sélecteur que
 * `auditer.mjs` reçoit en `--sombre` pour rejouer chaque écran en thème sombre.
 * Une classe CSS ferait l'affaire jusqu'au jour où on la renommerait ; un
 * attribut de données annonce qu'il est un point d'accroche.
 *
 * L'état est porté par `aria-pressed`, pas par le libellé : un lecteur d'écran
 * annonce donc « activé / désactivé » sans qu'on ait à écrire deux textes. Le
 * libellé visible, lui, dit vers quoi la bascule emmène — c'est ce qu'un
 * utilisateur voyant cherche à savoir.
 */
const { estSombre, basculer } = useTheme()
const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="bascule-theme"
    data-bascule-theme
    :aria-pressed="estSombre"
    :title="estSombre ? t('theme.vers_clair') : t('theme.vers_sombre')"
    @click="basculer"
  >
    <!-- `aria-hidden` : l'icône répète le libellé, elle ne l'ajoute pas. -->
    <svg
      class="bascule-theme__icone"
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <template v-if="estSombre">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </template>
      <path v-else d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
    </svg>

    <!--
      LE LIBELLÉ RESTE, MAIS IL SORT DU RENDU VISUEL — V4 §4.1.

      Écrit en clair, « Passer au thème sombre » occupait la largeur de trois
      contrôles et donnait à l'en-tête l'allure d'une barre d'outils
      d'administration. Le cahier demande un contrôle compact dont le nom
      accessible reste complet.

      `.visuellement-cache` et non `aria-label` sur le bouton : un `aria-label`
      REMPLACE le contenu pour un lecteur d'écran, mais le laisse invisible aux
      outils de traduction du navigateur et aux extensions qui lisent le texte.
      Le texte reste donc dans le document, hors du flux visuel — et `title`
      continue de servir l'info-bulle à la souris.
    -->
    <span class="bascule-theme__texte">
      {{ estSombre ? t('theme.vers_clair') : t('theme.vers_sombre') }}
    </span>
  </button>
</template>

<style scoped>
.bascule-theme {
  display: inline-flex;
  align-items: center;
  gap: var(--e-2);
  min-block-size: 34px;
  padding: 0 var(--e-3);
  font: inherit;
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--texte-doux);
  background: transparent;
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  cursor: pointer;
}

.bascule-theme:hover {
  color: var(--texte);
  background: var(--surface-douce);
}

.bascule-theme:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.bascule-theme__icone {
  flex: none;
}

/*
 * LE LIBELLÉ EST EN LECTURE D'ÉCRAN SEULE, À TOUTES LES LARGEURS — V4 §4.1.
 *
 * Il ne l'était que sous 26 rem. Écrit en clair sur un bureau, « Passer au
 * thème sombre » occupait la largeur de trois contrôles et donnait à l'en-tête
 * l'allure d'une barre d'outils d'administration — le reproche exact du
 * cahier. L'icône porte l'état, `title` porte l'info-bulle à la souris, et ce
 * texte reste le nom accessible.
 *
 * Il RESTE DANS LE DOCUMENT plutôt que de devenir un `aria-label` : un
 * `aria-label` remplace le contenu pour un lecteur d'écran, mais le dérobe aux
 * outils de traduction du navigateur, qui ne traduisent que du texte rendu.
 */
.bascule-theme__texte {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Le bouton n'entoure plus qu'une icône : le rembourrage se resserre, et la
   cible reste carrée. Elle ne descend jamais sous 34 px de haut, et le socle
   impose 44 px de cible tactile sur les surfaces publiques. */
.bascule-theme {
  padding-inline: var(--e-2);
}
</style>
