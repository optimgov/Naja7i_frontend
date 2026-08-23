<script setup lang="ts">
/**
 * CE QU'UN ÉCRAN AFFICHE QUAND LE SERVEUR N'A PAS RENDU SON CHAMP.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE N'EST PAS UN CADENAS, ET LA DIFFÉRENCE EST TOUT LE LOT
 *
 * La règle est que le mur est un champ : là où une action se trouvait, on ne
 * met rien — ni bouton grisé, ni carte floutée, ni « passez au palier
 * supérieur ». Les écrans respectent cela en ne rendant tout simplement pas le
 * geste, et le tableau de bord en n'y menant plus.
 *
 * Reste un cas que le silence ne couvre pas : l'adresse tapée à la main, ou le
 * signet d'un candidat dont le droit vient d'expirer. Il arrive alors sur une
 * page dont tout le contenu a disparu. Une page blanche sans issue est le pire
 * écran du produit — la mission le dit en ces termes — et la règle des portes
 * veut qu'un écran qui se ferme dise où aller.
 *
 * Ce composant est donc une SORTIE, pas une vitrine. Il ne nomme aucun palier,
 * n'affiche aucun prix, ne promet rien : il constate, et il rend deux chemins.
 * Le palier, lui, se nomme au catalogue et sur l'écran d'abonnement — les deux
 * endroits où le candidat est venu pour ça.
 *
 * IL N'EST JAMAIS RENDU À LA PLACE D'UN BOUTON. Les appelants le posent au
 * niveau de la PAGE, quand elle n'a plus rien d'autre à montrer.
 */
defineProps<{
  /**
   * La clé du constat, propre à l'écran — l'ordonnance et les révisions ne
   * disent pas la même chose. Aucun libellé en dur : l'appelant passe une clé.
   */
  cle: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <section class="non-rendu" role="status">
    <p class="non-rendu__constat">{{ t(cle) }}</p>

    <p class="non-rendu__issues">
      <NuxtLink class="btn" :to="localePath('/app')">
        {{ t('acces.retour_tableau') }}
      </NuxtLink>
      <NuxtLink class="lien-second" :to="localePath('/tarifs')">
        {{ t('acces.voir_offres') }}
      </NuxtLink>
    </p>
  </section>
</template>

<style scoped>
/* Pas de couleur d'alerte : rien n'a échoué, et un fond rouge ferait lire une
   panne là où il n'y a qu'une fonction non souscrite. La surface douce des
   faits, comme le coût annoncé. */
.non-rendu {
  display: grid;
  gap: var(--e-3);
  max-inline-size: 62rem;
  margin-block: var(--e-4);
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.non-rendu__constat { max-inline-size: 60ch; margin: 0; color: var(--texte-doux); }

.non-rendu__issues {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-3);
  align-items: center;
  margin: 0;
}
</style>
