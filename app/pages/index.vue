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

/* Faux tant que la réponse de `/demonstration/correction` n'a pas prouvé
   qu'elle porte réellement une question. Le CTA ne devance jamais le contenu. */
const demonstrationDisponible = ref(false)

/**
 * « Essayer la question » — V4 §4.2 : le premier geste ne change pas de page.
 *
 * Le CTA principal pointait vers `/se-preparer`, et l'ancre `#demonstration`
 * venait en second. La carte de question étant désormais le point focal du
 * héros, la déplacer d'un écran pour y revenir n'a plus de sens : à 1440 px
 * elle est déjà là.
 *
 * ON DÉPLACE LE FOCUS, PAS SEULEMENT LE REGARD. Un défilement seul laisse le
 * clavier au début du document : l'utilisateur qui suit le bouton à la
 * tabulation retraverse tout l'en-tête. Le focus sur le premier bouton radio
 * met le geste suivant — répondre — à une touche.
 *
 * `preventScroll` puis `scrollIntoView` explicite : le défilement natif du
 * focus ignore `prefers-reduced-motion`, celui-ci le respecte.
 */
function essayerLaQuestion() {
  const carte = document.getElementById('demonstration')
  if (!carte) return

  const sobre = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  carte.scrollIntoView({ behavior: sobre ? 'auto' : 'smooth', block: 'center' })

  const premiere = carte.querySelector<HTMLInputElement>('input[type="radio"]')
  /* Pas d'option à focaliser : la démonstration est en repli. La carte
   * elle-même porte `tabindex="-1"`, le focus y reste utile. */
  if (premiere) premiere.focus({ preventScroll: true })
  else carte.focus({ preventScroll: true })
}

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

          <!-- Micro-preuve : elle lève les deux objections qui arrêtent un
               visiteur avant le premier clic — « faut-il un compte ? » et
               « est-ce que ça compte contre moi ? ». Elle n'est pas un
               argument commercial, c'est un fait du produit. -->
          <p class="heros__micro-preuve">{{ t('accueil.micro_preuve') }}</p>

          <!--
            Compteurs calculés depuis le catalogue réel, et STRICTEMENT
            POSITIFS : la maquette annonçait « 4 200 questions justifiées » sur
            une banque vide, et « 0 filière » serait la faute symétrique. Le
            bloc entier disparaît si aucune métrique ne subsiste — trois cases
            dont deux sont vides se lisent comme un rendu cassé.
          -->
        </div>

        <!-- `tabindex="-1"` rend la cible focusable par le lien de fragment sans
             l'insérer dans l'ordre de tabulation. -->
        <div id="demonstration" tabindex="-1" class="ancre-demonstration">
          <ProofDemonstration
            contexte="accueil"
            @disponibilite="demonstrationDisponible = $event"
          />
        </div>

        <!--
          LES ACTIONS SUIVENT LA CARTE DANS LE DOM — recette Codex, point 1.

          À 390 px, la grille s'empile : deux boutons entre la micro-preuve et
          la question repoussaient les options SOUS LA BARRE BASSE. Le premier
          écran arabe ne montrait aucun choix.

          Quatrième enfant de grille plutôt qu'un `order` CSS : l'ordre du DOM
          reste l'ordre lu. À 1440 px, `grid-column: 1` les remet en deuxième
          rangée sous la colonne éditoriale — la composition bureau est
          identique à celle que la recette a validée.

          « ESSAYER LA QUESTION » DISPARAÎT SOUS 48 rem. Il déplace le focus
          vers une carte qui, à cette largeur, se trouve déjà juste au-dessus :
          le bouton demanderait un geste pour arriver là où le doigt est déjà.
          `display: none` et non un masquage visuel — un bouton lu par un
          lecteur d'écran mais sans objet est pire qu'absent.
        -->
        <div class="heros__actes">
          <!-- V4 §4.2 : le premier geste est de RÉPONDRE, sur place. Un
               bouton et non un lien de fragment — l'action déplace le focus
               dans la page, elle ne navigue pas. -->
          <button
            v-if="demonstrationDisponible"
            type="button"
            class="btn btn--grand heros__essayer"
            @click="essayerLaQuestion"
          >
            {{ t('accueil.action_principale') }}
          </button>
          <NuxtLink class="lien-second" :to="localePath('/se-preparer')">
            {{ t('accueil.action_seconde') }}
          </NuxtLink>
        </div>

        <!--
          LES COMPTEURS SORTENT DE LA COLONNE ÉDITORIALE — V4 §4.3.

          Ils s'intercalaient entre la micro-preuve et la question. À 390 px,
          où la grille s'empile, ils repoussaient la carte SOUS LE PLI : le
          premier écran montrait une promesse et trois nombres, jamais l'objet
          de la promesse. Le cahier fixe l'ordre — promesse, micro-preuve,
          question, choix, action — et les compteurs n'y figurent pas.

          Troisième enfant de grille plutôt qu'un `order` CSS : l'ordre du DOM
          reste l'ordre lu. Un `order` aurait donné une page qui se lit
          autrement qu'elle ne s'affiche, et c'est précisément ce qu'on a
          refusé sur le bloc confiance de la fiche d'annonce.

          À 1440 px, la grille place ce troisième enfant en deuxième rangée,
          sous la colonne éditoriale : la composition d'origine est conservée.
        -->
        <template v-if="chiffres.mesures.length">
          <div class="heros__assise">
            <dl class="assise">
              <div v-for="mesure in chiffres.mesures" :key="mesure.cle">
                <dt>{{ t(`accueil.chiffre_${mesure.cle}`) }}</dt>
                <dd>{{ nombre(mesure.valeur) }}</dd>
              </div>
            </dl>
            <p class="assise__note">{{ t('accueil.assise_note') }}</p>
          </div>
        </template>
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

/*
 * HÉROS ASYMÉTRIQUE 5/12 + 7/12 — V4 §4.2.
 *
 * Deux colonnes égales donnaient deux blocs de même poids : l'œil ne savait
 * pas lequel était le produit. La carte de question reçoit les 7/12 et devient
 * le point focal ; l'éditorial tient en 5/12, ce qui resserre aussi sa mesure
 * de lecture — un titre court se lit mieux sur une colonne étroite.
 *
 * `min-block-size` vise les 620–700 px du cahier SANS les imposer : `min` et
 * non `height`, pour qu'un texte plus long en arabe puisse pousser la section
 * au lieu d'être coupé. La hauteur est un objectif de composition, jamais une
 * contrainte de boîte.
 */
@media (min-width: 56rem) {
  .heros__grille {
    grid-template-columns: 5fr 7fr;
    gap: var(--e-7);
    align-items: start;
    min-block-size: 620px;
  }

  /* Actions puis compteurs reprennent la colonne éditoriale, en deuxième et
     troisième rangées : la composition bureau est identique à l'originale,
     sans les remettre devant la question à 390 px. */
  .heros__actes,
  .heros__assise { grid-column: 1; }

  /*
   * LA CARTE COUVRE LES TROIS RANGÉES, ET C'EST CE QUI REFERME LE VIDE.
   *
   * Sans cela, la rangée 1 prend la hauteur de la carte — la plus haute des
   * deux cellules — et les actions, placées en rangée 2, tombaient tout en bas
   * du héros, séparées de leur texte par un grand blanc. Le §6 interdit
   * justement « les grands espaces vides qui donnent l'impression que les
   * données n'ont pas chargé ».
   *
   * En couvrant les trois rangées, la carte laisse la colonne éditoriale se
   * dimensionner sur son propre contenu : texte, actions et compteurs
   * s'empilent serrés en haut, et la carte occupe la hauteur en regard.
   *
   * La COLONNE est épinglée en même temps que la rangée : donner un
   * `grid-row` explicite sort l'élément du placement automatique, et la carte
   * repartait en colonne 1 — éditorial et question échangeaient leurs places.
   */
  .ancre-demonstration { grid-column: 2; grid-row: 1 / span 3; }
}

/*
 * Sous 48 rem, la carte est immédiatement au-dessus : le bouton demanderait un
 * geste pour arriver là où le doigt est déjà. `display: none` plutôt qu'un
 * masquage visuel — un bouton annoncé par un lecteur d'écran mais sans objet
 * est pire qu'absent. « Choisir mon concours » reste, en action secondaire.
 */
@media (max-width: 47.99rem) {
  .heros__essayer { display: none; }

  /* Le chapeau se resserre : c'est lui qui pousse la carte vers le bas, et
     le H1 porte déjà la promesse. La taille des options et les cibles
     tactiles ne bougent pas — la recette l'interdit explicitement. */
  .heros__chapeau { margin-block: var(--e-2) var(--e-3); font-size: var(--t-md); }
  .heros { padding-block: var(--e-4) var(--e-4); }
}

/* Marge de séparation à 390 px, où ils suivent la carte au lieu de la
   précéder. Le trait de la règle `.assise` fait déjà la coupure visuelle. */
.heros__assise { margin-block-start: var(--e-2); }

/* Le fait qui lève les deux objections d'avant le premier clic. Ténu, mais sur
   `--fond` : `--texte-doux` y rend 7,04:1, bien au-dessus du seuil. */
.heros__micro-preuve {
  margin-block-start: var(--e-3);
  font-size: var(--t-sm);
  color: var(--texte-doux);
}
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

/*
 * CHRONOLOGIE — V4 §4.5 : « une ligne de progression sur bureau, une
 * chronologie verticale sur mobile ».
 *
 * Quatre cartes bordées ne disaient pas qu'il s'agit d'un ORDRE : elles se
 * lisaient comme quatre offres au choix. Le §6 interdit d'ailleurs « la
 * multiplication de cartes blanches ». La ligne, elle, porte le sens : on la
 * suit, et elle a un début.
 *
 * Le trait est un `::before` sur la liste, pas une bordure de chaque puce :
 * une bordure par élément se rompt à chaque intervalle, et le dernier segment
 * dépasse. Il est en `inset-inline` et `inset-block`, donc il se retourne seul
 * en arabe sans une seule règle miroir.
 */
.etapes {
  display: grid;
  gap: var(--e-5);
  margin-block-start: var(--e-5);
  padding: 0;
  list-style: none;
  position: relative;
}

/* Mobile : trait vertical, aligné sur le centre des pastilles (26 px / 2). */
.etapes::before {
  content: '';
  position: absolute;
  inset-block: 13px;
  inset-inline-start: 12px;
  inline-size: 2px;
  background: var(--bordure-forte);
}

.etape {
  display: grid;
  grid-template-columns: 26px 1fr;
  column-gap: var(--e-3);
  align-items: start;
}

@media (min-width: 48rem) {
  .etapes { grid-template-columns: repeat(4, 1fr); gap: var(--e-4); }

  /* Bureau : le trait passe à l'horizontale, sur la ligne des pastilles. */
  .etapes::before {
    inset-block: 13px auto;
    inset-inline: 13px 13px;
    inline-size: auto;
    block-size: 2px;
  }

  .etape { grid-template-columns: 1fr; row-gap: var(--e-2); }
}
/* `position: relative` + `z-index` : la pastille masque le trait qui passe
   derrière elle. Sans cela, la ligne barre le chiffre. */
.etape__n { display: inline-flex; align-items: center; justify-content: center; inline-size: 26px; block-size: 26px;
  border-radius: 999px; background: var(--vert-700); color: #fff; font-size: var(--t-xs); font-weight: 800;
  position: relative; z-index: 1; flex: none; }
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
