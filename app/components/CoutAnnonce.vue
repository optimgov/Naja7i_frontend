<script setup lang="ts">
import type { Enveloppe } from '~/composables/useAbonnement'

/**
 * LE COÛT, DIT AVANT LE GESTE — S-10, pas 3 de M-009.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES NOMBRES VIENNENT DU SERVEUR
 *
 * `remaining` est le reliquat RÉEL, dérivé côté serveur au lot 3B : la valeur
 * accordée moins les consommations enregistrées. Cet écran ne le recalcule
 * pas, ne l'estime pas, ne le met pas en cache — il l'affiche. C'est le même
 * nombre qui refusera la composition, et c'est pour cela qu'il peut être
 * annoncé sans mentir.
 *
 * `demande` est ce que le CANDIDAT vient de saisir dans le configurateur. Il ne
 * vient donc de nulle part ailleurs que de l'écran, et il n'est pas une
 * estimation : c'est la demande elle-même.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA SEULE ARITHMÉTIQUE FAITE ICI, ET POURQUOI ELLE EST LÉGITIME
 *
 * `min(demande, reliquat)`. Le lot 3B a tranché ce point explicitement
 * (M-008, hypothèse 2, verdict ACCEPTÉ) : le client connaît le total qu'il va
 * demander, lit le reliquat courant, et le serveur GARANTIT qu'aucune
 * composition ne dépassera. Une route « coût prévu » aurait été du code pour un
 * écran qui ne l'avait pas demandé.
 *
 * Ce n'est donc pas un second avis sur le prix : c'est la restitution d'une
 * garantie. Et la mission l'exige en toutes lettres — « si le reliquat ne
 * couvre pas la demande, l'écran annonce ce qui sera réellement composé, avant
 * le clic, pas après ».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SANS ENVELOPPE, ON N'ÉCRIT RIEN
 *
 * `enveloppe` nulle veut dire que rien ne se décompte — le forfait est
 * illimité. Il n'y a alors aucun coût à annoncer, et inventer une phrase
 * rassurante à sa place reviendrait à dessiner un champ que le serveur n'a pas
 * rendu. C'est la règle du lot, appliquée à son propre composant.
 *
 * Ce composant ne rend JAMAIS le geste fermé : quand la capacité manque,
 * l'appelant ne rend pas l'action du tout, et n'appelle donc pas ce composant.
 */
const props = defineProps<{
  /** L'enveloppe qui gouverne la capacité. `null` = rien ne se décompte. */
  enveloppe: Enveloppe | null
  /**
   * Le nombre de questions demandé, quand l'écran le laisse choisir.
   * `null` quand c'est le serveur qui compose — on annonce alors le reliquat
   * seul, parce qu'annoncer un coût qu'on ne connaît pas serait l'inventer.
   */
  demande?: number | null
}>()

const { t } = useI18n()
const localePath = useLocalePath()

const reliquat = computed(() => props.enveloppe?.remaining ?? null)

/** Épuisée : plus rien à composer. Un fait, pas un mur. */
const epuisee = computed(() => reliquat.value === 0)

/** Ce qui sera RÉELLEMENT composé. Voir l'en-tête pour la légitimité du `min`. */
const compose = computed(() => {
  if (reliquat.value === null || props.demande == null) return null
  return Math.min(props.demande, reliquat.value)
})

const insuffisant = computed(
  () => compose.value !== null && props.demande != null && compose.value < props.demande,
)
</script>

<template>
  <!-- Aucune enveloppe : aucun champ, donc aucun rendu. -->
  <p v-if="enveloppe" class="cout" role="status">
    <!-- Enveloppe épuisée. On dit le fait, et la sortie est un LIEN vers
         l'écran d'abonnement — pas une mention de palier collée là où l'action
         se trouvait. La mission autorise le palier dans cet écran-là, pas ici. -->
    <template v-if="epuisee">
      <span class="cout__fait">{{ t('cout.epuisee') }}</span>
      <NuxtLink class="lien-second" :to="localePath('/app/abonnement')">
        {{ t('cout.voir_abonnement') }}
      </NuxtLink>
    </template>

    <!-- Le reliquat ne couvre pas la demande : on annonce ce qui sera composé,
         avant le clic. C'est la moitié de S-10 qui arrivait après. -->
    <template v-else-if="insuffisant">
      <span class="cout__fait">
        {{ t('cout.insuffisant', {
          demande: nombre(demande ?? 0),
          n: nombre(compose ?? 0),
          unite: enveloppe.unit_label,
        }) }}
      </span>
    </template>

    <!-- Le cas courant : « cette série utilisera 10 de vos 12 restantes ». -->
    <template v-else-if="compose !== null">
      <span class="cout__fait">
        {{ t('cout.utilisera', {
          n: nombre(compose),
          reliquat: nombre(reliquat ?? 0),
          unite: enveloppe.unit_label,
        }) }}
      </span>
    </template>

    <!-- Le serveur compose : on n'annonce que ce qu'on sait, le reliquat. -->
    <template v-else>
      <span class="cout__fait">
        {{ t('cout.reste', { n: nombre(reliquat ?? 0), unite: enveloppe.unit_label }) }}
      </span>
    </template>
  </p>
</template>

<style scoped>
/* Le coût se lit AVANT le bouton : la place porte l'information autant que les
   mots. Il n'est pas une alerte — rien n'a échoué — donc pas de couleur de
   système, seulement la surface douce des faits. */
.cout {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-3);
  align-items: baseline;
  max-inline-size: 62ch;
  margin-block: 0 var(--e-4);
  padding: var(--e-3) var(--e-4);
  font-size: var(--t-sm);
  background: var(--surface-douce);
  border-inline-start: 3px solid var(--accent);
  border-radius: var(--r);
}

.cout__fait { font-weight: 600; }
</style>
