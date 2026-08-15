<script setup lang="ts">
/**
 * `/robot` — la page que le User-Agent du collecteur promet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI ELLE EXISTE, ET POURQUOI ELLE EST UN PRÉREQUIS DE PRODUCTION
 *
 * Le collecteur s'annonce `Naja7iBot/1.0 (+https://naja7i.ma/robot)`. Le
 * `robots.txt` du portail ne nous autorise pas NOMMÉMENT : il autorise tout
 * robot à lire les fiches. La contrepartie de cette autorisation implicite est
 * d'être JOIGNABLE — un User-Agent qui pointe vers une 404 vaut à peine mieux
 * qu'un User-Agent anonyme, et se fait bannir aussi vite.
 *
 * D-O7 du dépôt collecteur en fait un prérequis explicite : la collecte de
 * développement peut tourner sans, la mise en ligne publique non.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TOUT CE QUI EST ÉCRIT ICI EST VÉRIFIABLE DANS LE CODE DU COLLECTEUR
 *
 * Le User-Agent, le délai de deux secondes par hôte, le respect de
 * `Retry-After`, le recul exponentiel : `naja7i_opp/reseau.py`. La cadence de
 * deux heures et la double lecture FR/AR : D-O8. Annoncer une politesse qu'on
 * ne tient pas serait pire que de ne rien annoncer — un administrateur système
 * qui mesure l'écart ne nous écrira pas, il nous bloquera.
 *
 * INDEXABLE, et c'est le but : c'est par une recherche sur notre User-Agent
 * qu'un administrateur arrivera ici. Pas de `noindex`.
 */
definePageMeta({ layout: 'public' })

const { t } = useI18n()

/* L'adresse est un FAIT, pas un libellé : elle ne se traduit pas, et elle est
 * écrite une seule fois. Une adresse qui diverge entre deux langues est une
 * adresse morte dans l'une des deux. */
const CONTACT = 'robot@naja7i.ma'
const USER_AGENT = 'Naja7iBot/1.0 (+https://naja7i.ma/robot)'

useSeoCatalogue({
  title: t('robot.seo_titre'),
  description: t('robot.seo_description'),
  path: '/robot',
})
</script>

<template>
  <div class="enveloppe robot">
    <p class="oeil">{{ t('robot.oeil') }}</p>
    <h1 class="titre-page">{{ t('robot.titre') }}</h1>
    <p class="chapeau">{{ t('robot.chapeau') }}</p>

    <section class="robot__bloc">
      <h2>{{ t('robot.qui_titre') }}</h2>
      <p>{{ t('robot.qui_texte') }}</p>

      <dl class="robot__faits">
        <div>
          <dt>{{ t('robot.fait_agent') }}</dt>
          <!-- `dir="ltr"` : un User-Agent est une chaîne technique, et sur une
               page arabe l'algorithme bidirectionnel en déplacerait les
               parenthèses et le `+`. Il doit se lire tel qu'il part sur le
               réseau, sans quoi il n'est pas cherchable. -->
          <dd><code dir="ltr">{{ USER_AGENT }}</code></dd>
        </div>
        <div>
          <dt>{{ t('robot.fait_source') }}</dt>
          <dd>{{ t('robot.fait_source_valeur') }}</dd>
        </div>
      </dl>
    </section>

    <section class="robot__bloc">
      <h2>{{ t('robot.cadence_titre') }}</h2>
      <ul class="robot__liste">
        <li>{{ t('robot.cadence_passage') }}</li>
        <li>{{ t('robot.cadence_delai') }}</li>
        <li>{{ t('robot.cadence_retry') }}</li>
        <li>{{ t('robot.cadence_conditionnel') }}</li>
      </ul>
      <p class="robot__note">{{ t('robot.cadence_note') }}</p>
    </section>

    <section class="robot__bloc">
      <h2>{{ t('robot.arret_titre') }}</h2>
      <p>{{ t('robot.arret_texte') }}</p>

      <!-- UNE ADRESSE, ET RIEN À REMPLIR. Un formulaire de contact derrière une
           demande d'arrêt de robot ajoute une friction là où il faut la
           retirer : celui qui écrit veut que ça cesse, pas remplir un champ. -->
      <p class="robot__contact">
        <a :href="`mailto:${CONTACT}`" dir="ltr">{{ CONTACT }}</a>
      </p>

      <p class="robot__note">{{ t('robot.arret_delai') }}</p>
    </section>

    <section class="robot__bloc">
      <h2>{{ t('robot.usage_titre') }}</h2>
      <p>{{ t('robot.usage_texte') }}</p>
      <p class="robot__note">{{ t('robot.usage_officiel') }}</p>
    </section>
  </div>
</template>

<style scoped>
.robot { padding-block: var(--e-6) var(--e-8); max-inline-size: 62rem; }

.robot__bloc {
  margin-block-start: var(--e-6);
  padding-block-start: var(--e-5);
  border-block-start: 1px solid var(--bordure);
}

.robot__bloc h2 { font-size: var(--t-xl); }

.robot__faits { display: grid; gap: var(--e-4); margin-block-start: var(--e-4); }

@media (min-width: 42rem) {
  .robot__faits { grid-template-columns: repeat(2, 1fr); }
}

.robot__faits dt {
  font-size: var(--t-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--texte-doux);
}

.robot__faits dd { margin: var(--e-1) 0 0; }

.robot__faits code {
  display: inline-block;
  padding: var(--e-1) var(--e-2);
  font-family: var(--mono);
  font-size: var(--t-sm);
  background: var(--surface-douce);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  overflow-wrap: anywhere;
}

.robot__liste { display: grid; gap: var(--e-2); padding-inline-start: var(--e-5); }

.robot__contact {
  margin-block: var(--e-3);
  font-size: var(--t-lg);
  font-weight: 700;
}

.robot__note { font-size: var(--t-sm); color: var(--texte-doux); max-inline-size: 64ch; }
</style>
