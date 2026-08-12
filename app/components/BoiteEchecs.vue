<script setup lang="ts">
/**
 * Boîte d'échec de la file d'envoi.
 *
 * Elle existe parce qu'un refus définitif était supprimé en silence (BLOC-5) :
 * l'entrée disparaissait, la série se soumettait, et le serveur comptait la
 * question comme SAUTÉE. Mesuré : `skipped_count` passe de 0 à 1, ce qui remonte
 * le domaine dans l'ordonnance sous le motif « questions_sautees ». Le candidat
 * avait répondu ; le produit lui reprochait une esquive.
 *
 * Rien ne sort d'ici sans un geste humain — `acquitterRefus` est le seul chemin
 * de suppression d'une entrée non envoyée.
 *
 * `role="alert"` et non `status` : contrairement au bandeau hors connexion, il y
 * a ici quelque chose à faire, et la série ne peut pas se clore avant.
 */
const { refuses, acquitterRefus, proprietaireAutre, proprietaire } = useFileEnvoi()
const { t } = useI18n()
</script>

<template>
  <div v-if="proprietaireAutre" class="echecs echecs--proprietaire" role="alert" data-file-proprietaire>
    <h2 class="echecs__titre">{{ t('file.proprietaire_titre') }}</h2>
    <p class="echecs__texte">{{ t('file.proprietaire_texte') }}</p>
    <!-- L'identifiant du propriétaire n'est PAS affiché : il ne dirait rien au
         candidat et nommerait un autre compte. -->
    <span class="lecture-seule">{{ proprietaire }}</span>
  </div>

  <div v-else-if="refuses.length" class="echecs" role="alert" data-file-echecs>
    <h2 class="echecs__titre">{{ t('file.echecs_titre') }}</h2>
    <p class="echecs__texte">{{ t('file.echecs_texte') }}</p>

    <ul class="echecs__liste">
      <li v-for="entree in refuses" :key="entree.id" class="echecs__ligne">
        <span class="echecs__repere">
          {{ entree.repere?.position
            ? t('file.question', { n: entree.repere.position })
            : entree.chemin }}
        </span>
        <span v-if="entree.refus" class="echecs__motif" dir="auto">{{ entree.refus.message }}</span>
        <button type="button" class="btn btn--discret" @click="acquitterRefus(entree.id)">
          {{ t('file.acquitter') }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.echecs {
  margin-block-end: var(--e-4);
  padding: var(--e-4);
  color: var(--sys-err-texte);
  background: var(--sys-err-fond);
  border: 1px solid var(--sys-err-bordure);
  border-radius: var(--r);
}

/* Le conflit de propriétaire n'est pas une erreur système : personne n'a fauté,
   et la conduite à tenir est différente. Il porte donc les jetons du remède. */
.echecs--proprietaire {
  color: var(--peda-remede-texte);
  background: var(--peda-remede-fond);
  border-color: var(--peda-remede-bordure);
}

.echecs__titre { margin-block: 0 var(--e-2); font-size: var(--t-md); font-weight: 800; }
.echecs__texte { margin-block: 0 var(--e-3); font-size: var(--t-sm); }

.echecs__liste { display: grid; gap: var(--e-2); margin: 0; padding: 0; list-style: none; }

.echecs__ligne {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-3);
  align-items: center;
  font-size: var(--t-sm);
}

.echecs__repere { font-weight: 700; }
.echecs__motif { color: var(--texte-doux); }
</style>
