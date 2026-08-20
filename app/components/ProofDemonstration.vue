<script setup lang="ts">
/**
 * La démonstration — UNE CORRECTION RÉELLE, ET ELLE SE JOUE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SEUL COMPOSANT POUR L'ACCUEIL ET POUR `/se-preparer`
 *
 * Deux implémentations auraient divergé, et elles auraient divergé sur ce que
 * ce produit vend : la façon dont une correction se présente. Le contexte ne
 * change ici QUE l'action proposée à la fin — `contexte` ne pilote rien
 * d'autre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ELLE ÉTAIT PASSIVE, ET C'ÉTAIT LE DÉFAUT PRINCIPAL
 *
 * Elle révélait la bonne réponse d'emblée. Un visiteur lisait donc un corrigé
 * sans avoir rien tenté — c'est-à-dire l'inverse exact de ce que la promesse
 * annonce. « Comprendre ses erreurs » suppose une erreur, donc un choix, donc
 * un moment où l'on ne sait pas encore.
 *
 * LA CORRECTION N'EST PAS SEULEMENT MASQUÉE : ELLE N'EXISTE PAS.
 *
 * `v-if`, jamais `v-show` ni une classe. Un bloc masqué en CSS reste dans
 * l'arbre d'accessibilité : un lecteur d'écran annoncerait la bonne réponse
 * avant que le visiteur ait choisi, et la tabulation la traverserait. La
 * démonstration serait passive pour les uns et jouable pour les autres.
 *
 * CE QUI N'EST PAS UNE GARANTIE, ET QU'ON NE PRÉTEND PAS : `is_correct` reste
 * dans la charge réseau servie par l'API. C'est acceptable pour une preuve
 * publique — il n'y a rien à protéger ici, aucun score n'est enregistré — mais
 * ce n'est pas un secret, et l'écrire évite de le croire.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AUCUN SCORE APRÈS UNE QUESTION, ET LA PHRASE LE DIT
 *
 * C'est la même règle que l'assise du score dans l'espace candidat : une
 * réponse ne fonde rien. Ne pas afficher de score ne suffirait pas — un
 * visiteur en déduirait un. On l'écrit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTRAINTE PAS-8, NON NÉGOCIABLE : la mention « exemple » vient de
 * `meta.notice`. Elle n'est JAMAIS écrite ici, et il n'existe AUCUN repli en
 * dur. Si le champ disparaît côté serveur, la mention disparaît de l'écran.
 *
 * LA REMÉDIATION EST FACULTATIVE, ET L'ACTION SUIVANTE N'EN DÉPEND PAS. Le
 * contrat la sert à `null` quand la question n'en porte pas ; le chemin vers la
 * suite ne doit pas s'évanouir avec elle.
 *
 * Banque vide : l'API répond 404 `DEMO_NOT_AVAILABLE`. On affiche alors un état
 * sobre AVEC SES PORTES — un visiteur n'a pas à connaître nos codes d'état, et
 * un cul-de-sac n'est pas un état.
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

withDefaults(
  defineProps<{
    /** Ce que l'on propose APRÈS la correction. Seule chose que le contexte pilote. */
    contexte?: 'accueil' | 'preparer'
  }>(),
  { contexte: 'accueil' },
)

const { t, te, locale } = useI18n()
const localePath = useLocalePath()
const api = useApi()

/*
 * LA LOCALE EST DEMANDÉE EXPLICITEMENT.
 *
 * `DemonstrationController` lit le paramètre de REQUÊTE `locale`, avec `fr`
 * pour défaut, et filtre la banque dessus (`where('locale', $locale)`).
 * `useApi` envoie `Accept-Language` — que ce contrôleur ne consulte pas. Un
 * visiteur arabophone recevait donc une question française, sur le bloc même
 * qui porte la promesse du produit.
 *
 * La clé porte la locale : sans elle, la réponse française resterait en cache
 * après la bascule de langue.
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

// ────────────────────────────────────────────────────── l'interaction

const choix = ref<number | null>(null)
const revele = ref(false)
const correction = ref<HTMLElement | null>(null)

/*
 * La question CHANGE si la langue change — le contrôleur tire au sort à chaque
 * appel (`inRandomOrder()`). Une correction révélée sur l'énoncé précédent
 * resterait affichée sous un nouvel énoncé, et désignerait la mauvaise réponse
 * comme « la vôtre ». On repart donc de l'état neuf avec la donnée.
 */
watch(() => demo.value?.question.uuid, () => {
  choix.value = null
  revele.value = false
})

const optionChoisie = computed(() =>
  demo.value?.options.find((o) => o.position === choix.value) ?? null,
)

const juste = computed(() => optionChoisie.value?.is_correct === true)

/**
 * L'autopsie n'existe que si la réponse est FAUSSE et que le contrat porte une
 * cause. Elle est formulée comme une hypothèse — et cette mention vient du CSS
 * (`.autopsie__hypothese::after`), jamais de la rédaction : aucun contenu futur
 * ne peut donc présenter une cause comme un verdict.
 */
const cause = computed(() =>
  !juste.value && optionChoisie.value?.cause ? optionChoisie.value.cause : null,
)

function valider(): void {
  if (choix.value === null) return

  revele.value = true

  /* Le focus SUIT la révélation. Sans cela, un candidat au clavier valide et
     rien ne bouge de son point de vue : le contenu neuf est apparu quarante
     lignes plus bas, derrière son curseur. */
  nextTick(() => correction.value?.focus())
}

/** Le libellé d'une cause. Le code brut ne s'affiche jamais tel quel. */
function libelleCause(code: string): string {
  return te(`causes.${code}`) ? t(`causes.${code}`) : code
}
</script>

<template>
  <!-- Repli sobre, ET SES PORTES. « En préparation » seul était un cul-de-sac :
       le visiteur arrivait sur la preuve du produit et n'avait rien à faire. -->
  <aside v-if="indisponible" class="preuve preuve--vide">
    <p class="preuve__attente">{{ t('demonstration.indisponible') }}</p>
    <div class="preuve__actes">
      <NuxtLink class="btn btn--fantome" :to="localePath('/concours')">
        {{ t('demonstration.voir_concours') }}
      </NuxtLink>
      <NuxtLink
        v-if="contexte === 'accueil'"
        class="lien-second"
        :to="localePath('/se-preparer')"
      >
        {{ t('demonstration.comprendre_methode') }}
      </NuxtLink>
    </div>
  </aside>

  <aside v-else class="preuve" :aria-label="mention || undefined">
    <!-- Rendue seulement si le serveur l'a envoyée. -->
    <p v-if="mention" class="preuve__mention" dir="auto">{{ mention }}</p>

    <p v-if="demo!.competency.name" class="preuve__competence" dir="auto">
      {{ demo!.competency.name }}
    </p>

    <!-- ═══════════════ AVANT VALIDATION — on choisit, on ne lit pas ═══════ -->
    <form v-if="!revele" novalidate @submit.prevent="valider">
      <fieldset class="preuve__champ">
        <legend class="preuve__enonce" dir="auto">{{ demo!.question.stem }}</legend>

        <ol class="preuve__options">
          <li v-for="option in demo!.options" :key="option.position" class="preuve__option">
            <label class="preuve__choix">
              <input
                v-model="choix"
                type="radio"
                name="demonstration"
                class="preuve__radio"
                :value="option.position"
              >
              <span class="preuve__contenu" dir="auto">{{ option.content }}</span>
            </label>
          </li>
        </ol>
      </fieldset>

      <!--
        VALIDATION INDISPONIBLE, ET LA RAISON EST LUE.

        `aria-disabled` plutôt que `disabled` : un bouton `disabled` sort de
        l'ordre de tabulation, si bien qu'un candidat au clavier ne le rencontre
        jamais et ne peut pas apprendre POURQUOI il ne peut pas continuer. Là, il
        l'atteint, l'entend annoncé « indisponible », et `aria-describedby` lui
        donne la raison dans la foulée.
      -->
      <p v-if="choix === null" id="preuve-raison" class="preuve__raison-bloquee" role="status">
        {{ t('demonstration.choix_requis') }}
      </p>

      <button
        type="submit"
        class="btn btn--bloc preuve__valider"
        :aria-disabled="choix === null"
        :aria-describedby="choix === null ? 'preuve-raison' : undefined"
      >
        {{ t('demonstration.valider') }}
      </button>
    </form>

    <!-- ═════════ APRÈS VALIDATION — la correction, et rien avant ═════════ -->
    <div v-else ref="correction" class="preuve__correction" tabindex="-1">
      <p class="preuve__enonce" dir="auto">{{ demo!.question.stem }}</p>

      <!-- Le verdict est ÉCRIT. La couleur des options ne le porte pas : sous
           deutéranopie, juste et faux sont à ΔE 0,1 sur les aplats. -->
      <p class="preuve__verdict" role="status">
        {{ juste ? t('demonstration.verdict_juste') : t('demonstration.verdict_faux') }}
      </p>

      <ol class="preuve__options">
        <li
          v-for="option in demo!.options"
          :key="option.position"
          class="preuve__option"
          :class="{
            'preuve__option--juste': option.is_correct,
            'preuve__option--choisie': option.position === choix,
          }"
        >
          <!-- Deux marqueurs ÉCRITS, et ils peuvent coexister sur une même
               option — c'est même le cas le plus heureux. -->
          <p class="preuve__marques">
            <span v-if="option.is_correct" class="preuve__marque preuve__marque--juste">
              {{ t('demonstration.marque_bonne') }}
            </span>
            <span v-if="option.position === choix" class="preuve__marque">
              {{ t('demonstration.marque_votre') }}
            </span>
          </p>

          <p class="preuve__contenu" dir="auto">{{ option.content }}</p>

          <!-- CHAQUE option reçoit sa justification, y compris celles que
               personne n'a choisies : « pourquoi pas cette réponse ? » est la
               moitié de ce que ce produit vend. -->
          <p class="preuve__justification" dir="auto">{{ option.rationale }}</p>
        </li>
      </ol>

      <!-- L'AUTOPSIE — une hypothèse sur le raisonnement, jamais un jugement sur
           la personne. La mention « hypothèse » est posée par le CSS. -->
      <p v-if="cause" class="autopsie">
        <span class="autopsie__hypothese">
          {{ t('correction.autopsie') }} : {{ libelleCause(cause) }}
        </span>
      </p>

      <!-- La remédiation SI le contrat la porte. L'action suivante, plus bas,
           n'en dépend jamais. -->
      <!-- Même composition que l'écran de correction du candidat : un libellé,
           le titre, la durée. On ne se donne pas un second vocabulaire pour
           dire la même chose sur deux surfaces du même produit. -->
      <p v-if="demo!.remediation" class="preuve__remede">
        <span class="preuve__remede-libelle">{{ t('correction.remediation') }}</span>
        <span dir="auto">{{ demo!.remediation.title }}</span>
        <span v-if="demo!.remediation.estimated_minutes !== null">
          {{ t('correction.minutes', { n: demo!.remediation.estimated_minutes }) }}
        </span>
      </p>

      <!-- AUCUN SCORE, ET ON DIT POURQUOI. Le taire laisserait le visiteur en
           déduire un. -->
      <p class="preuve__assise">{{ t('demonstration.pas_de_score') }}</p>

      <div class="preuve__actes">
        <NuxtLink
          v-if="contexte === 'accueil'"
          class="btn"
          :to="localePath('/se-preparer')"
        >
          {{ t('demonstration.suite_accueil') }}
        </NuxtLink>
        <a v-else class="btn" href="#epreuves">{{ t('demonstration.suite_preparer') }}</a>

        <NuxtLink class="lien-second" :to="localePath('/concours')">
          {{ t('demonstration.voir_concours') }}
        </NuxtLink>
      </div>
    </div>
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
  gap: var(--e-4);
  place-items: center;
  min-block-size: 12rem;
  text-align: center;
}

.preuve__attente {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--texte-doux);
  max-inline-size: 42ch;
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

/* Le `<fieldset>` du navigateur porte une bordure et des marges propres qu'on
   neutralise : la question n'est pas un encadré dans un encadré. */
.preuve__champ {
  margin: 0;
  padding: 0;
  border: 0;
}

.preuve__enonce {
  margin: 0 0 var(--e-3);
  padding: 0;
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

/* La ligne entière est cliquable, et sa cible dépasse 44 px de haut : sur
   téléphone, viser un bouton radio de 24 px est un geste qu'on rate. */
.preuve__choix {
  display: flex;
  align-items: center;
  gap: var(--e-3);
  min-block-size: 44px;
  cursor: pointer;
}

.preuve__radio {
  flex: none;
  inline-size: 24px;
  block-size: 24px;
  margin: 0;
  accent-color: var(--accent);
}

.preuve__radio:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.preuve__contenu {
  margin: 0;
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--texte);
}

.preuve__raison-bloquee {
  margin: var(--e-3) 0 var(--e-2);
  font-size: var(--t-xs);
  color: var(--texte-doux);
}

.preuve__valider { margin-block-start: var(--e-3); }

/* Le bloc de correction reçoit le focus après validation. Il ne doit pas
   entrer pour autant dans l'ordre de tabulation : `tabindex="-1"` le rend
   focalisable par programme seulement. */
.preuve__correction:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.preuve__verdict {
  margin: 0 0 var(--e-3);
  font-size: var(--t-sm);
  font-weight: 700;
  color: var(--texte);
}

/* Bordure de début de ligne : à droite en arabe, à gauche en français. */
.preuve__option--juste {
  background: var(--peda-juste-fond);
  border-inline-start: 3px solid var(--peda-juste);
}

.preuve__option--choisie { border-color: var(--bordure-forte); }

.preuve__marques {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2);
  margin: 0 0 var(--e-2);
}

/* Le marqueur est du TEXTE. C'est lui qui porte l'état, pas l'aplat : juste et
   faux sont à ΔE 0,1 sous deutéranopie sur les fonds pédagogiques. */
.preuve__marque {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.5rem;
  font-size: var(--t-2xs);
  font-weight: 800;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--texte-doux);
  background: var(--neutre-fond);
  border: 1px solid var(--bordure);
  border-radius: var(--r-pilule);
}

.preuve__marque--juste {
  color: var(--peda-juste-texte);
  border-color: var(--peda-juste-bordure);
}

.preuve__justification {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--texte-doux);
}

/* Pas de --mono : depuis qu'elle est traduite, la cause est de la prose, arabe
   comprise, et les piles monospace couvrent mal l'arabe. */
.preuve__remede {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem var(--e-2);
  margin: var(--e-3) 0 0;
  font-size: var(--t-xs);
  color: var(--peda-remede-texte);
}

.preuve__remede-libelle { font-weight: 700; }

.preuve__assise {
  margin: var(--e-4) 0 0;
  padding-block-start: var(--e-3);
  border-block-start: 1px solid var(--bordure);
  font-size: var(--t-xs);
  color: var(--texte-doux);
}

.preuve__actes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--e-3) var(--e-4);
  margin-block-start: var(--e-4);
}
</style>
