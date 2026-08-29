<script setup lang="ts">
/**
 * LE MINI-REPÈRE — une explication courte, attachée à ce qu'elle explique.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI PAS `title=""`
 *
 * L'attribut `title` du navigateur est la fausse bonne réponse : il n'apparaît
 * qu'au survol — donc jamais sur un téléphone, où se fait l'essentiel de la
 * navigation au Maroc —, il ne s'ouvre pas au clavier, son délai n'est pas
 * réglable, et plusieurs lecteurs d'écran l'ignorent. Il aurait donné
 * l'apparence d'une aide sans en être une.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'IL EST À LA PLACE
 *
 * Un bouton qui révèle un texte SOUS lui, dans le flux. Rien ne flotte, rien
 * ne se positionne, rien ne déborde de l'écran : une bulle flottante finit
 * toujours par sortir du cadre sur 360 px de large, ou par passer sous le
 * clavier virtuel.
 *
 * `aria-expanded` porte l'état et `aria-controls` le lien vers le texte : un
 * lecteur d'écran annonce donc « développé / réduit » sans qu'on écrive deux
 * libellés. Le bouton lui-même est nommé par ce qu'il explique — « Aide » seul
 * ne dit rien dans une liste de dix repères.
 */
const props = defineProps<{
  /** Ce que le repère explique — sert à le nommer pour les lecteurs d'écran. */
  sujet: string
  texte: string
}>()

const { t } = useI18n()
const ouvert = ref(false)
const identifiant = useId()
const nom = computed(() => t('guide.repere_sur', { sujet: props.sujet }))
</script>

<template>
  <span class="repere">
    <button
      type="button"
      class="repere__declencheur"
      :aria-expanded="ouvert"
      :aria-controls="identifiant"
      :aria-label="nom"
      @click="ouvert = !ouvert"
    >
      <span aria-hidden="true">?</span>
    </button>

    <span v-if="ouvert" :id="identifiant" class="repere__texte" role="note" dir="auto">{{ texte }}</span>
  </span>
</template>

<style scoped>
.repere { display: contents; }

.repere__declencheur {
  /* 44 px de cible tactile, sans occuper 44 px de mise en page : le bouton
     reste petit, sa zone cliquable ne l'est pas. */
  position: relative;
  inline-size: 1.5rem;
  block-size: 1.5rem;
  margin-inline-start: var(--e-2);
  border: 1px solid var(--bordure);
  border-radius: 50%;
  background: transparent;
  color: var(--texte-doux);
  font-size: 0.8rem;
  line-height: 1;
  cursor: pointer;
}

.repere__declencheur::after {
  content: '';
  position: absolute;
  inset-block: -0.6rem;
  inset-inline: -0.6rem;
}

.repere__declencheur:hover,
.repere__declencheur[aria-expanded='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.repere__texte {
  display: block;
  margin-block-start: var(--e-2);
  padding: var(--e-2) var(--e-3);
  border-inline-start: 3px solid var(--accent);
  border-radius: var(--r-s);
  background: var(--surface-douce, var(--surface));
  color: var(--texte-doux);
  font-size: var(--t-sm);
  font-weight: 400;
  max-inline-size: 60ch;
}
</style>
