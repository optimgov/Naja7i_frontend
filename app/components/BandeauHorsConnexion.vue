<script setup lang="ts">
/**
 * Bandeau de coupure réseau.
 *
 * CE QU'IL DIT, ET POURQUOI CE N'EST PAS DÉCORATIF
 *
 * Un candidat qui voit sa connexion tomber pendant une passation suppose que
 * ses réponses sont perdues, et il recommence — ou il abandonne. Le bandeau
 * existe pour dire l'inverse, et il ne peut le dire que parce que c'est vrai :
 * la file d'envoi conserve les réponses et les rejoue au retour du réseau.
 *
 * Il annonce donc DEUX choses, jamais une seule : que la connexion est coupée,
 * et que ce qui a été répondu est gardé. Le premier message sans le second
 * produit exactement la panique qu'on cherche à éviter.
 *
 * `role="status"` et non `role="alert"` : l'information est importante mais ne
 * demande aucun geste immédiat. `alert` interromprait la lecture de la question
 * en cours.
 */
const { coupe } = useReseau()
const { enAttente } = useFileEnvoi()
const { t } = useI18n()
</script>

<template>
  <Transition name="bandeau">
    <div v-if="coupe" class="hors-ligne" role="status" data-hors-ligne>
      <span class="hors-ligne__signe" aria-hidden="true">⚠</span>

      <p class="hors-ligne__texte">
        <strong>{{ t('reseau.coupe_titre') }}</strong>
        <!-- Le compte des réponses en attente n'apparaît que s'il y en a :
             « 0 réponse en attente » inquiéterait sans rien apprendre.

             Formulé sans accord de nombre — « en attente d'envoi : 3 » plutôt
             que « 3 réponses » — pour n'avoir à écrire aucune forme plurielle.
             L'arabe en compte six, et vue-i18n ne les tranche pas seul : une
             règle de pluriel approximative produit une faute de langue à chaque
             affichage, là où la tournure neutre n'en produit aucune. -->
        <span v-if="enAttente">
          {{ t('reseau.coupe_attente', { n: enAttente }) }}
        </span>
        <span v-else>{{ t('reseau.coupe_texte') }}</span>
      </p>
    </div>
  </Transition>
</template>

<style scoped>
.hors-ligne {
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
  display: flex;
  gap: var(--e-3);
  align-items: flex-start;
  padding: var(--e-3) var(--e-4);
  font-size: var(--t-sm);
  color: var(--peda-remede-texte);
  background: var(--peda-remede-fond);
  border-block-end: 1px solid var(--peda-remede-bordure);
}

.hors-ligne__signe {
  flex: none;
  font-weight: 700;
}

.hors-ligne__texte {
  margin: 0;
}

.hors-ligne__texte strong {
  margin-inline-end: 0.35em;
}

/* `prefers-reduced-motion` est déjà neutralisé globalement dans tokens.css :
   la transition y tombe à 0,01 ms. Rien à répéter ici. */
.bandeau-enter-active,
.bandeau-leave-active {
  transition: opacity var(--transition), transform var(--transition);
}

.bandeau-enter-from,
.bandeau-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}
</style>
