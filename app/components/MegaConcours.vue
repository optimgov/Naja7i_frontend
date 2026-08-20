<script setup lang="ts">
import type { Filiere } from '~/composables/useCatalogue'

/**
 * Le méga-menu « Concours » — UNE COLONNE PAR FILIÈRE PUBLIÉE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IL VIENT DU CATALOGUE, JAMAIS D'UNE LISTE ÉCRITE ICI
 *
 * Une liste en dur vieillit en silence : le jour où une filière ouvre, ferme ou
 * change de nom, le menu de l'en-tête — c'est-à-dire la surface la plus vue du
 * site — annonce autre chose que les pages qu'il désigne. `useAsyncData`
 * déduplique par clé : le pied de page lit déjà `catalogue`, cette lecture ne
 * coûte donc aucune requête de plus.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TROIS FAMILLES PAR COLONNE, ET C'EST UNE CONTRAINTE
 *
 * Un méga-menu qui déplierait toutes les spécialités deviendrait un arbre de
 * base de données posé sur une page d'accueil. Une famille profonde se découvre
 * sur SA page, où elle dispose de la place et du contexte. Le menu n'est pas un
 * plan du site : c'est un aiguillage.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * « SE PRÉPARER » N'APPARAÎT QUE SI UNE PRÉPARATION EXISTE
 *
 * La condition est `family.availability === 'open'`, et ce choix est mesuré.
 * `/catalogue` sert les filières et leurs familles, mais NI épreuves NI
 * spécialités : vérifier qu'une épreuve ouverte existe imposerait un appel par
 * famille ouverte, sur CHAQUE page publique, au rendu serveur. Une disponibilité
 * de famille est ce que le contrat public sait dire sans N+1, et c'est déjà la
 * règle qui gouverne `epreuvesOuvertes()` — une famille en liste d'attente ne
 * propose aucun diagnostic.
 *
 * La conséquence est acceptée et nommée : une famille ouverte dont la banque de
 * questions serait vide ferait apparaître l'action. `/se-preparer`, au bout du
 * lien, lit les épreuves réelles et n'en invente aucune — c'est là que
 * l'absence se dit, pas dans un menu.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CATALOGUE ILLISIBLE : LE PANNEAU NE MENT PAS
 *
 * Il ne rend ni « 0 filière » ni une liste vide silencieuse. Il propose la
 * seule chose qui reste vraie — la page du catalogue — et le dit en une phrase.
 */
const props = defineProps<{ filieres: Filiere[], illisible: boolean }>()

const { t } = useI18n()
const localePath = useLocalePath()

/** Les trois premières familles PUBLIÉES, dans l'ordre du contrat. */
function familles(filiere: Filiere) {
  return (filiere.families ?? []).slice(0, 3)
}

/** Une préparation existe-t-elle dans cette filière ? Voir l'en-tête. */
function preparable(filiere: Filiere): boolean {
  return (filiere.families ?? []).some((f) => f.availability === 'open')
}

/**
 * L'état se LIT — aucun code d'énumération brut à l'écran.
 *
 * Le repli rendait le code reçu : « waitlist » s'affichait tel quel dans le
 * menu le plus vu du site dès que la clé manquait. La correspondance partagée
 * rend `null` sur une valeur qu'on ne sait pas nommer, et la mention disparaît
 * plutôt que de fuir un identifiant de base de données.
 */
function disponibilite(code: string): string {
  const cle = cleDisponibilite(code)
  return cle ? t(cle) : ''
}

const colonnes = computed(() => props.filieres)
</script>

<template>
  <div class="mega">
    <div class="enveloppe">
      <p v-if="illisible" class="mega__illisible">
        {{ t('navigation.mega_illisible') }}
      </p>

      <div v-else class="mega__grille">
        <section v-for="filiere in colonnes" :key="filiere.uuid" class="mega__colonne">
          <h2 class="mega__titre">
            <NuxtLink :to="localePath(`/concours/${filiere.slug}`)" dir="auto">
              {{ filiere.name }}
            </NuxtLink>
          </h2>

          <!-- L'état est écrit, pas teinté : `open`, `waitlist` et `closed` ne
               se distinguent accessiblement par aucune échelle de couleur. -->
          <p v-if="disponibilite(filiere.availability)" class="mega__etat">
            {{ disponibilite(filiere.availability) }}
          </p>

          <ul class="mega__liste">
            <li v-for="famille in familles(filiere)" :key="famille.uuid">
              <NuxtLink
                class="mega__lien"
                :to="localePath(`/concours/famille/${famille.slug}`)"
                dir="auto"
              >
                {{ famille.name }}
              </NuxtLink>
            </li>
          </ul>

          <p v-if="preparable(filiere)" class="mega__acte">
            <NuxtLink class="lien-second" :to="localePath('/se-preparer')">
              {{ t('navigation.se_preparer') }}
            </NuxtLink>
          </p>
        </section>
      </div>

      <p class="mega__pied">
        <NuxtLink class="lien-second" :to="localePath('/concours')">
          {{ t('navigation.mega_tout_voir') }}
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
