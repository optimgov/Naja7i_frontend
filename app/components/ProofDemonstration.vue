<script setup lang="ts">
/**
 * Bloc de preuve du héros — une correction réelle, servie par l'API.
 *
 * CONTRAINTE PAS-8, NON NÉGOCIABLE : la mention « exemple » vient de
 * `meta.notice`. Elle n'est JAMAIS écrite ici, et il n'existe AUCUN repli en
 * dur. Si le champ disparaît côté serveur, la mention disparaît de l'écran —
 * c'est précisément la garantie recherchée. Une interface qui réécrit
 * elle-même le marqueur contractuel le vide de son sens : elle continuerait
 * d'afficher « exemple » le jour où le serveur cesse de le dire.
 *
 * Banque vide : l'API répond 404 `DEMO_NOT_AVAILABLE`. On affiche alors un
 * état sobre, sans erreur technique — un visiteur n'a pas à connaître nos
 * codes d'état.
 */
interface OptionDemo {
  position: number
  content: string
  is_correct: boolean
  rationale: string
  cause: string | null
}

interface Demonstration {
  is_example: boolean
  question: { uuid: string; stem: string; explanation: string | null }
  options: OptionDemo[]
  competency: { code: string | null; name: string | null }
  exam: { code: string | null; name: string | null; coefficient: number | null }
  remediation: { title: string; estimated_minutes: number | null } | null
}

const { t, te, locale } = useI18n()
const api = useApi()

/*
 * LA LOCALE EST DEMANDÉE EXPLICITEMENT, ET C'EST UN DÉFAUT CORRIGÉ.
 *
 * `DemonstrationController` lit le paramètre de REQUÊTE `locale`, avec `fr`
 * pour défaut, et filtre la banque dessus (`where('locale', $locale)`).
 * `useApi` envoie `Accept-Language` — que ce contrôleur ne consulte pas. Un
 * visiteur arabophone recevait donc une question française, sur le bloc même
 * qui porte la promesse du produit.
 *
 * La clé de `useAsyncData` porte la locale : sans elle, la réponse française
 * resterait en cache après la bascule de langue, et le correctif serait invisible
 * une navigation sur deux.
 */
const { data, error } = await useAsyncData(
  () => `demonstration:${locale.value}`,
  () => api.get<{ data: Demonstration; meta?: { notice?: string } }>(
    '/demonstration/correction',
    { locale: locale.value },
  ),
  { watch: [locale] },
)

const demo = computed(() => data.value?.data ?? null)

/** Vide si le serveur ne la fournit pas. Aucune valeur de substitution. */
const mention = computed(() => data.value?.meta?.notice?.trim() ?? '')

/* Véracité, non identité : selon les versions, `useAsyncData` place `null` ou
   `undefined` dans `error` en cas de succès — comparer à `null` faisait
   basculer le bloc en repli alors que l'API répondait. */
const indisponible = computed(() => Boolean(error.value) || demo.value === null)
</script>

<template>
  <!-- Repli sobre : la banque se constitue, on le dit sans jargon. -->
  <aside v-if="indisponible" class="preuve preuve--vide">
    <p class="preuve__attente">{{ t('catalogue.en_preparation') }}</p>
  </aside>

  <aside v-else class="preuve" :aria-label="mention || undefined">
    <!-- Rendue seulement si le serveur l'a envoyée. -->
    <p v-if="mention" class="preuve__mention" dir="auto">{{ mention }}</p>

    <p v-if="demo!.competency.name" class="preuve__competence" dir="auto">
      {{ demo!.competency.name }}
    </p>

    <p class="preuve__enonce" dir="auto">{{ demo!.question.stem }}</p>

    <ol class="preuve__options">
      <li
        v-for="option in demo!.options"
        :key="option.position"
        class="preuve__option"
        :class="{ 'preuve__option--juste': option.is_correct }"
      >
        <p class="preuve__contenu" dir="auto">{{ option.content }}</p>
        <p class="preuve__raison" dir="auto">{{ option.rationale }}</p>

        <!-- La cause n'existe que sur les distracteurs (fiche F03). Le code
             brut ne s'affiche jamais : il est traduit, et sert de repli
             seulement si un code inconnu apparaissait. -->
        <p v-if="option.cause" class="preuve__cause">
          {{ te(`causes.${option.cause}`) ? t(`causes.${option.cause}`) : option.cause }}
        </p>
      </li>
    </ol>
  </aside>
</template>

<style scoped>
.preuve {
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.preuve--vide {
  display: grid;
  place-items: center;
  min-block-size: 12rem;
}

.preuve__attente {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

/* La mention d'exemple est la première chose lue : elle dit au visiteur qu'il
   regarde une démonstration et qu'il n'a rien répondu. */
.preuve__mention {
  margin: 0 0 var(--e-3);
  padding: var(--e-2) var(--e-3);
  font-size: var(--t-xs);
  font-weight: 700;
  /* Rôles, pas rampes : --safran-50 ne bascule pas avec le thème, et un fond
     clair invariant sous un texte qui, lui, passe au clair rend la mention
     illisible en sombre. Même faute que celle relevée au chantier 1. */
  color: var(--peda-remede-texte);
  background: var(--peda-remede-fond);
  border-radius: var(--r);
}

.preuve__competence {
  margin: 0 0 var(--e-2);
  font-size: var(--t-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--texte-doux);
}

.preuve__enonce {
  margin: 0 0 var(--e-3);
  font-size: var(--t-md);
  font-weight: 600;
  line-height: 1.5;
  color: var(--texte);
}

.preuve__options {
  display: grid;
  gap: var(--e-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.preuve__option {
  padding: var(--e-3);
  background: var(--fond);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

/* Bordure de début de ligne : à droite en arabe, à gauche en français. */
.preuve__option--juste {
  background: var(--peda-juste-fond);
  border-inline-start: 3px solid var(--peda-juste);
}

.preuve__contenu {
  margin: 0 0 var(--e-1);
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--texte);
}

.preuve__raison {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--texte-doux);
}

/* Pas de --mono ici : depuis qu'elle est traduite, la cause est de la prose,
   arabe comprise, et les piles monospace couvrent mal l'arabe. --mono reste
   réservée aux codes d'épreuve et références de concours. */
.preuve__cause {
  margin: var(--e-2) 0 0;
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--peda-faux-texte);
}
</style>
