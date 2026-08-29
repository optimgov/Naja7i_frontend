<script setup lang="ts">
/**
 * LE GUIDE D'UN ÉCRAN CANDIDAT — ouvert la première fois, replié ensuite.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI IL EXISTE
 *
 * Le back-office explique chacun de ses écrans depuis le 27 août. L'espace
 * candidat, lui, n'expliquait rien : un candidat qui ouvrait « ordonnance » ou
 * « maîtrise » devait deviner ce qu'il regardait. Relevé le 29 août — « aucun
 * guide équivalent dans l'espace candidat ou le parcours public ».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OUVERT À LA PREMIÈRE VISITE, ET C'EST LE POINT
 *
 * Un panneau toujours replié est invisible pour celui-là même à qui il est
 * écrit. Un panneau toujours ouvert devient un bandeau qu'on saute. Le guide
 * s'ouvre donc tant que la personne ne l'a jamais refermé SUR CET ÉCRAN ; dès
 * qu'elle le referme, il reste replié. Elle décide une fois.
 *
 * Le repli vit dans le navigateur : c'est une préférence d'affichage, pas une
 * donnée du dossier. Le perdre en changeant de poste rouvre un guide, ce qui
 * n'a jamais nui à personne.
 *
 * `<details>` porte tout cela sans script : ouverture au clavier, annonce aux
 * lecteurs d'écran, et un rendu correct même si le JavaScript ne s'exécute
 * jamais — auquel cas le guide reste ouvert, le bon défaut.
 */
const props = defineProps<{
  /**
   * Identifiant de l'écran. Il sert DEUX fois : il désigne le bloc de
   * traductions `guide.<clé>`, et il sert de clé de repli dans le navigateur.
   * Un seul identifiant pour les deux évite qu'ils divergent — et le renommer
   * rouvre le guide chez tout le monde, ce qui est sans conséquence.
   */
  cle: string
}>()

/*
 * LES LISTES SONT RÉSOLUES ICI, ET NULLE PART AILLEURS.
 *
 * `tm()` ne rend pas des chaînes mais des messages compilés : les passer
 * directement à un `v-for` afficherait des objets. Il faut `rt()` sur chacun.
 * Le faire dans onze pages, c'est dix occasions de l'oublier — et l'oubli ne
 * casse rien, il affiche seulement « [object Object] » à un candidat.
 */
const { t, tm, rt, te } = useI18n()

const titre = computed(() => t(`guide.${props.cle}.titre`))
const role = computed(() => t(`guide.${props.cle}.role`))

function liste(rubrique: string): string[] {
  const chemin = `guide.${props.cle}.${rubrique}`

  if (!te(chemin)) return []

  const brut = tm(chemin)

  return Array.isArray(brut) ? brut.map((message) => rt(message as never)) : []
}

const gestes = computed(() => liste('gestes'))
const vide = computed(() => liste('vide'))

const panneau = ref<HTMLDetailsElement | null>(null)
const stockage = computed(() => `naja7i.guide.${props.cle}`)

onMounted(() => {
  try {
    if (window.localStorage.getItem(stockage.value) === 'replie' && panneau.value) {
      panneau.value.open = false
    }
  } catch {
    /* Stockage refusé — navigation privée, réglage strict. Le guide reste
       ouvert : l'état qu'on ne peut pas connaître vaut une première visite. */
  }
})

function memoriser(): void {
  try {
    window.localStorage.setItem(stockage.value, panneau.value?.open ? 'ouvert' : 'replie')
  } catch { /* sans stockage, le choix ne survit pas à la page */ }
}
</script>

<template>
  <details ref="panneau" open class="guide" @toggle="memoriser">
    <summary class="guide__declencheur">
      <span class="guide__titre" dir="auto">{{ titre }}</span>
      <span class="guide__chevron" aria-hidden="true">▾</span>
    </summary>

    <div class="guide__corps">
      <p class="guide__role" dir="auto">{{ role }}</p>

      <template v-if="gestes.length">
        <p class="guide__rubrique">{{ t('guide.gestes') }}</p>
        <ul class="guide__liste">
          <li v-for="geste in gestes" :key="geste" dir="auto">{{ geste }}</li>
        </ul>
      </template>

      <template v-if="vide.length">
        <p class="guide__rubrique">{{ t('guide.vide') }}</p>
        <ul class="guide__liste">
          <li v-for="cas in vide" :key="cas" dir="auto">{{ cas }}</li>
        </ul>
      </template>

      <slot />
    </div>
  </details>
</template>

<style scoped>
.guide {
  margin-block: var(--e-4);
  border: 1px solid var(--bordure);
  border-radius: var(--r-m);
  background: var(--surface);
}

.guide__declencheur {
  display: flex;
  align-items: center;
  gap: var(--e-3);
  /* La cible tactile ne descend jamais sous 44 px — §24 de commun.css. */
  min-block-size: 44px;
  padding: var(--e-3) var(--e-4);
  cursor: pointer;
  font-weight: 600;
}

.guide__titre { flex: 1; }

/* Le chevron tourne pour dire l'état ; il ne le dit pas seul — `<details>`
   l'annonce déjà aux lecteurs d'écran. */
.guide__chevron { transition: transform 0.15s; }
.guide[open] .guide__chevron { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .guide__chevron { transition: none; } }

.guide__corps {
  padding: 0 var(--e-4) var(--e-4);
  border-block-start: 1px solid var(--bordure);
  padding-block-start: var(--e-3);
}

.guide__role { margin: 0; max-inline-size: 65ch; }

.guide__rubrique {
  margin-block: var(--e-3) var(--e-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--texte-doux);
}

.guide__liste {
  margin: 0;
  padding-inline-start: var(--e-5);
  display: grid;
  gap: var(--e-1);
  max-inline-size: 65ch;
}
</style>
