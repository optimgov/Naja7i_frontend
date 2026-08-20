<script setup lang="ts">
definePageMeta({ layout: 'public' })

const { t } = useI18n()
const localePath = useLocalePath()
const { filieres } = useCatalogue()
const { data: portes } = await filieres()
const chiffres = useChiffresReels()

/*
 * LES ANNONCES SUR L'ACCUEIL — ARBITRAGE A2, ET C'EST UN BUDGET DE SURFACE.
 *
 * Elles tiennent DEUX emplacements et pas un de plus : un bandeau d'une ligne
 * au-dessus du héros, et une section d'échéances plus bas. Moins de 22 % de la
 * hauteur de page — un seuil qui n'était pas tenu, et qui est désormais
 * BLOQUANT dans `scripts/recette-zone-publique.mjs`.
 *
 * TROIS LIGNES, ET LE NOMBRE EST UNE CONTRAINTE. Le fil de six cartes mesurait
 * 34,4 % à 1440 px et 37,0 % à 390 px : l'accueil était devenu un tableau
 * d'affichage. Trois lignes prouvent que la plateforme est vivante ; le tapis
 * complet est à un clic, et c'est là qu'il doit être.
 */
const { annonces } = useOpportunites()
const { data: opportunites, error: erreurOpportunites } = await annonces()

/* Illisible → la donnée DISPARAÎT. Ni bandeau, ni fil, aucun chiffre inventé. */
const annoncesLues = computed(() =>
  erreurOpportunites.value || !opportunites.value ? [] : opportunites.value.data,
)

/**
 * Les TROIS échéances les plus PROCHES parmi les annonces ouvertes.
 *
 * Trié par urgence et non par date de publication : un accueil qui montrerait
 * les dernières collectées afficherait des concours clos en tête le jour où le
 * collecteur tourne au ralenti. L'urgence, elle, reste vraie.
 */
const fil = computed(() =>
  annoncesLues.value
    .filter(a => estOuverte(a))
    .sort((a, b) => (a.jours ?? 0) - (b.jours ?? 0))
    .slice(0, 3),
)

const meta = computed(() =>
  erreurOpportunites.value || !opportunites.value ? null : opportunites.value.meta,
)

/** Les trois preuves de méthode, CONDENSÉES : leurs seuls titres, et la porte
 *  vers la page qui les développe. Recopier ici les textes de `/se-preparer`
 *  aurait créé deux rédactions d'une même promesse, qui divergent au premier
 *  ajustement. */
const PREUVES = ['autopsie', 'distracteurs', 'assise'] as const

/** La FAQ. Chaque réponse est un fait déjà vrai ailleurs dans le produit —
 *  aucune n'annonce une fonctionnalité, un délai ou un prix qui n'existe pas. */
const FAQ = ['officiel', 'compte', 'gratuit', 'sources', 'paiement'] as const

useSeoCatalogue({
  title: t('accueil.seo_titre'),
  description: t('accueil.seo_description'),
  path: '/',
})
</script>

<template>
  <div>
    <!-- 1. Au-dessus du héros : une échéance qui presse se lit avant la
         promesse, pas après. Le composant se TAIT quand rien ne presse — un
         bandeau permanent devient du mobilier. -->
    <BandeauEcheance :annonces="annoncesLues" />

    <!-- ══════════════════ 2. HÉROS + DÉMONSTRATION JOUABLE ══════════════════ -->
    <section class="heros">
      <div class="enveloppe heros__grille">
        <div>
          <p class="oeil">{{ t('accueil.oeil') }}</p>
          <!-- Texte simple, pas de v-html : le compilateur i18n refuse le HTML dans
               les messages, et il a raison — une traduction n'est pas un gabarit.
               La coupure de ligne revient à la typographie, pas au contenu. -->
          <h1 class="heros__titre">{{ t('accueil.titre') }}</h1>
          <p class="heros__chapeau">{{ t('accueil.chapeau') }}</p>

          <div class="heros__actes">
            <!--
              LE CTA PRINCIPAL A CHANGÉ DE DESTINATION, ET C'ÉTAIT À TRANCHER.

              Il pointait sur `#demonstration`, faute de mieux : `/methode/
              correction` n'avait jamais existé, et le bouton principal de
              l'accueil menait à un 404. L'ancre était le correctif honnête du
              moment — la correction promise était déjà sur la page.

              Depuis que la démonstration est JOUABLE et qu'elle est partagée
              avec `/se-preparer`, l'ancre n'est plus le bon premier geste : elle
              déplace le regard vers un bloc déjà visible à 1440 px, et le
              parcours entier — choisir une épreuve, comprendre la correction,
              commencer un diagnostic — vit maintenant à une adresse.

              L'ancre RESTE, en second : à 390 px la démonstration est sous le
              pli, et un lien de fragment vers une cible `tabindex="-1"` y amène
              le regard ET le focus clavier sans une ligne de JavaScript.
            -->
            <NuxtLink class="btn btn--grand" :to="localePath('/se-preparer')">
              {{ t('accueil.action_principale') }}
            </NuxtLink>
            <a class="lien-second" href="#demonstration">
              {{ t('accueil.action_seconde') }}
            </a>
          </div>

          <!--
            Compteurs calculés depuis le catalogue réel, et STRICTEMENT
            POSITIFS : la maquette annonçait « 4 200 questions justifiées » sur
            une banque vide, et « 0 filière » serait la faute symétrique. Le
            bloc entier disparaît si aucune métrique ne subsiste — trois cases
            dont deux sont vides se lisent comme un rendu cassé.
          -->
          <template v-if="chiffres.mesures.length">
            <dl class="assise">
              <div v-for="mesure in chiffres.mesures" :key="mesure.cle">
                <dt>{{ t(`accueil.chiffre_${mesure.cle}`) }}</dt>
                <dd>{{ nombre(mesure.valeur) }}</dd>
              </div>
            </dl>
            <p class="assise__note">{{ t('accueil.assise_note') }}</p>
          </template>
        </div>

        <!-- `tabindex="-1"` rend la cible focusable par le lien de fragment sans
             l'insérer dans l'ordre de tabulation. -->
        <div id="demonstration" tabindex="-1" class="ancre-demonstration">
          <ProofDemonstration contexte="accueil" />
        </div>
      </div>
    </section>

    <!-- ═══════════ 3. CHOISISSEZ CE QUE VOUS PRÉPAREZ — depuis le catalogue ═══
         Remontée AU-DESSUS du parcours : un visiteur arrive en cherchant un
         concours, pas une méthode. On le prend là où il est, puis on l'y
         conduit. -->
    <section class="section section--douce">
      <div class="enveloppe">
        <p class="oeil">{{ t('accueil.portes_oeil') }}</p>
        <h2 class="titre-section">{{ t('accueil.portes_titre') }}</h2>
        <div class="grille grille--3">
          <CarteConcours
            v-for="porte in portes"
            :key="porte.uuid"
            :to="localePath(`/concours/${porte.slug}`)"
            :titre="porte.name"
            :texte="porte.tagline"
            :disponibilite="porte.availability"
          />
        </div>
      </div>
    </section>

    <!-- ═════════════════════ 4. LE PARCOURS EN QUATRE ÉTAPES ════════════════ -->
    <section class="section">
      <div class="enveloppe">
        <p class="oeil">{{ t('accueil.parcours_oeil') }}</p>
        <h2 class="titre-section">{{ t('accueil.parcours_titre') }}</h2>
        <ol class="etapes">
          <li v-for="n in 4" :key="n" class="etape">
            <span class="etape__n">{{ n }}</span>
            <h3 class="etape__titre">{{ t(`accueil.etape_${n}_titre`) }}</h3>
            <p class="etape__texte">{{ t(`accueil.etape_${n}_texte`) }}</p>

            <!--
              TROIS ÉTAPES SUR QUATRE PORTENT UNE ACTION, ET LA QUATRIÈME N'EN
              PORTE PAS.

              Les trois premières ont une destination publique qui dit vraiment
              ce qu'elles annoncent : choisir son épreuve, lire une correction,
              consulter les poids officiels des domaines. La quatrième — « aucun
              score tant que les réponses sont trop peu nombreuses » — n'en a
              aucune : c'est une règle du produit, pas un écran. Lui coller un
              lien vers les tarifs pour équilibrer la rangée reviendrait à
              vendre une retenue comme une fonctionnalité.
            -->
            <p v-if="n === 1" class="etape__acte">
              <NuxtLink class="lien-second" :to="localePath('/se-preparer')">
                {{ t('accueil.etape_1_acte') }}
              </NuxtLink>
            </p>
            <p v-else-if="n === 2" class="etape__acte">
              <a class="lien-second" href="#demonstration">{{ t('accueil.etape_2_acte') }}</a>
            </p>
            <p v-else-if="n === 3" class="etape__acte">
              <NuxtLink class="lien-second" :to="localePath('/concours')">
                {{ t('accueil.etape_3_acte') }}
              </NuxtLink>
            </p>
          </li>
        </ol>
      </div>
    </section>

    <!-- ═══════════ 5. LES TROIS PREUVES, CONDENSÉES ET RELIÉES ══════════════ -->
    <section class="section section--douce">
      <div class="enveloppe">
        <p class="oeil">{{ t('accueil.preuves_oeil') }}</p>
        <h2 class="titre-section">{{ t('accueil.preuves_titre') }}</h2>

        <ul class="preuves-courtes">
          <li v-for="preuve in PREUVES" :key="preuve">
            {{ t(`preparer.preuve_${preuve}_titre`) }}
          </li>
        </ul>

        <NuxtLink class="lien-second" :to="localePath('/se-preparer')">
          {{ t('accueil.preuves_lien') }}
        </NuxtLink>
      </div>
    </section>

    <!-- ══════════════ 6. LES ÉCHÉANCES DE LA SEMAINE — TROIS LIGNES ═════════
         La classe `.fil-actu` est CONSERVÉE : c'est elle que mesure le contrôle
         de surface de `recette-zone-publique.mjs`. La renommer aurait fait
         mesurer zéro à la recette, qui aurait déclaré le budget tenu sans avoir
         rien mesuré. -->
    <section v-if="fil.length" class="fil-actu section">
      <div class="enveloppe">
        <div class="fil-actu__entete">
          <div>
            <p class="oeil">{{ t('accueil.fil_oeil') }}</p>
            <h2 class="titre-section">{{ t('accueil.fil_titre') }}</h2>
          </div>

          <NuxtLink class="lien-second" :to="localePath('/opportunites')">
            {{ t('accueil.fil_tout_voir') }}
          </NuxtLink>
        </div>

        <!-- À 390 px les trois lignes s'empilent — aucun carrousel : un contenu
             qu'il faut faire défiler latéralement pour découvrir n'est pas
             découvert. -->
        <ul class="echeances">
          <LigneEcheance v-for="annonce in fil" :key="annonce.id" :annonce="annonce" />
        </ul>

        <!-- LE MARQUEUR DE FIXTURE VIENT DU SERVEUR. S'il cesse d'être servi,
             la mention disparaît — elle ne se replie pas sur une valeur en dur.
             Règle « aucun repli en dur sur un marqueur contractuel ». -->
        <p v-if="meta?.fixture" class="fil-actu__fixture" dir="auto">
          {{ t('accueil.fil_fixture', { source: meta.source }) }}
        </p>
      </div>
    </section>

    <!-- ══════════════════════════ 7. FAQ COURTE ET FACTUELLE ════════════════
         `<details>` natif : ouverture au clavier, annoncé « réduit/développé »
         par les lecteurs d'écran, et zéro ligne de JavaScript. Un accordéon
         maison aurait coûté un composant et une dette d'accessibilité pour le
         même rendu. -->
    <section class="section">
      <div class="enveloppe faq">
        <p class="oeil">{{ t('accueil.faq_oeil') }}</p>
        <h2 class="titre-section">{{ t('accueil.faq_titre') }}</h2>

        <details v-for="question in FAQ" :key="question" class="faq__item">
          <summary class="faq__question">{{ t(`accueil.faq_${question}_q`) }}</summary>
          <p class="faq__reponse">{{ t(`accueil.faq_${question}_r`) }}</p>
        </details>
      </div>
    </section>
  </div>
</template>

<style scoped>
.heros { padding-block: var(--e-6) var(--e-5); background: var(--fond); border-block-end: 1px solid var(--bordure); }
.heros__grille { display: grid; gap: var(--e-5); align-items: start; }
@media (min-width: 56rem) { .heros__grille { grid-template-columns: 1fr 1fr; gap: var(--e-6); } }
.heros__titre {
  text-wrap: balance; font-size: var(--t-4xl); max-inline-size: 16ch; }
.heros__titre :deep(em) { font-style: normal; color: var(--terre-700); }
.heros__chapeau { margin-block: var(--e-3) var(--e-4); font-size: var(--t-lg); color: var(--texte-doux); max-inline-size: 44ch; }
.heros__actes { display: flex; align-items: center; gap: var(--e-4); flex-wrap: wrap; }

/* Cible du lien de fragment. `scroll-margin` évite que l'en-tête collant ne
   recouvre le haut du bloc à l'arrivée ; le contour de focus est celui du
   socle, pas un contour propre — on ne double pas la règle. */
.ancre-demonstration { scroll-margin-block-start: var(--e-6); }
.ancre-demonstration:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }

.assise { display: flex; flex-wrap: wrap; gap: var(--e-4); margin-block-start: var(--e-5);
  padding-block-start: var(--e-3); border-block-start: 1px solid var(--bordure-forte); }
.assise div { display: flex; flex-direction: column-reverse; }
.assise dt { font-size: var(--t-sm); color: var(--texte-doux); }
.assise dd { margin: 0; font-size: var(--t-xl); font-weight: 800; letter-spacing: -.03em; }
.assise__note { margin-block-start: var(--e-2); font-size: var(--t-xs); color: var(--texte-doux); max-inline-size: 52ch; }

.etapes { display: grid; gap: var(--e-3); margin-block-start: var(--e-4); padding: 0; list-style: none; }
@media (min-width: 48rem) { .etapes { grid-template-columns: repeat(4, 1fr); } }
.etape { display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--bordure); border-radius: var(--r); padding: var(--e-4); }
.etape__n { display: inline-flex; align-items: center; justify-content: center; inline-size: 26px; block-size: 26px;
  border-radius: 999px; background: var(--vert-700); color: #fff; font-size: var(--t-xs); font-weight: 800; margin-block-end: var(--e-2); }
.etape__titre { font-size: var(--t-md); margin-block-end: 4px; }
.etape__texte { font-size: var(--t-sm); color: var(--texte-doux); }
/* `margin-block-start: auto` aligne les actions d'une rangée même quand les
   textes ont des longueurs différentes. */
.etape__acte { margin-block: auto 0; padding-block-start: var(--e-3); }

.preuves-courtes {
  display: grid;
  gap: var(--e-3);
  margin-block: var(--e-4);
  padding: 0;
  list-style: none;
}
@media (min-width: 48rem) { .preuves-courtes { grid-template-columns: repeat(3, 1fr); } }
.preuves-courtes li {
  padding: var(--e-4);
  font-size: var(--t-md);
  font-weight: 700;
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-inline-start: 3px solid var(--accent);
  border-radius: var(--r);
}

/* Les trois lignes d'échéance. `display: grid` à une colonne : à 390 px elles
   s'empilent, et à 1440 px elles restent des lignes — jamais un carrousel. */
.echeances { display: grid; gap: var(--e-2); margin: 0; padding: 0; list-style: none; }

/* `.fil-actu`, `.fil-actu__entete` et `.echeance-ligne` viennent de
   `commun.css` : la maquette les nommait `.fil*`, nom déjà pris par le fil
   d'Ariane depuis le FRONT-1. Seule la mention de fixture est propre à cet
   écran. */
.fil-actu__fixture {
  margin-block-start: var(--e-4);
  font-size: var(--t-xs);
  color: var(--texte-doux);
}

.faq { max-inline-size: 64ch; }

.faq__item {
  padding-block: var(--e-3);
  border-block-end: 1px solid var(--bordure);
}

.faq__question {
  /* 44 px de cible, comme toutes les commandes de ce dépôt. Le marqueur natif
     est conservé : il porte l'état ouvert/fermé sans une ligne de CSS. */
  display: flex;
  align-items: center;
  min-block-size: 44px;
  font-size: var(--t-md);
  font-weight: 700;
  color: var(--texte);
  cursor: pointer;
}

.faq__question:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.faq__reponse {
  margin-block: var(--e-2) 0;
  font-size: var(--t-sm);
  line-height: 1.6;
  color: var(--texte-doux);
}
</style>
