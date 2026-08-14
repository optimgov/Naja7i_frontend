<script setup lang="ts">
definePageMeta({ layout: 'public' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const { filieres } = useCatalogue()
const { data: portes } = await filieres()
const chiffres = useChiffresReels()

/*
 * LES ANNONCES SUR L'ACCUEIL — ARBITRAGE A2, ET C'EST UN BUDGET DE SURFACE.
 *
 * Elles tiennent DEUX emplacements et pas un de plus : un bandeau d'une ligne
 * au-dessus du héros, et une section « Le fil » en bas. Moins de 22 % de la
 * hauteur de page. L'accueil VEND la méthode ; l'agrégat la nourrit, il ne la
 * remplace pas — un accueil devenu tableau d'affichage aurait gagné en trafic
 * ce qu'il aurait perdu en raison d'être.
 *
 * SIX CARTES, et le nombre est une contrainte. Le fil PROUVE que la plateforme
 * est vivante ; il ne remplace pas le tapis, qui est à un clic.
 */
const { annonces } = useOpportunites()
const { data: opportunites, error: erreurOpportunites } = await annonces()

/* Illisible → la donnée DISPARAÎT. Ni bandeau, ni fil, aucun chiffre inventé. */
const annoncesLues = computed(() =>
  erreurOpportunites.value || !opportunites.value ? [] : opportunites.value.data,
)

/**
 * Le fil : les six échéances les plus PROCHES parmi les annonces ouvertes.
 *
 * Trié par urgence et non par date de publication : un accueil qui montrerait
 * les dernières collectées afficherait des concours clos en tête le jour où le
 * collecteur tourne au ralenti. L'urgence, elle, reste vraie.
 */
const fil = computed(() =>
  annoncesLues.value
    .filter(a => estOuverte(a))
    .sort((a, b) => (a.jours ?? 0) - (b.jours ?? 0))
    .slice(0, 6),
)

const meta = computed(() =>
  erreurOpportunites.value || !opportunites.value ? null : opportunites.value.meta,
)

useSeoCatalogue({
  title: t('accueil.seo_titre'),
  description: t('accueil.seo_description'),
  path: '/',
})
</script>

<template>
  <div>
    <!-- Au-dessus du héros, comme dans la maquette : une échéance qui presse se
         lit avant la promesse, pas après. Le composant se TAIT quand rien ne
         presse — un bandeau permanent devient du mobilier. -->
    <BandeauEcheance :annonces="annoncesLues" />

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
              Ancre, pas route : `/methode/correction` n'existe pas et n'a
              jamais existé — le bouton principal de l'accueil menait à un 404.
              La correction expliquée qu'il promet est déjà sur la page, juste
              à côté : c'est le bloc de démonstration. Un lien de fragment vers
              une cible `tabindex="-1"` y amène le regard ET le focus clavier,
              sans une ligne de JavaScript, et `scroll-behavior` est déjà neutralisé
              sous `prefers-reduced-motion`.
            -->
            <a class="btn btn--grand" href="#demonstration">
              {{ t('accueil.action_principale') }}
            </a>
            <NuxtLink class="lien-second" :to="localePath('/concours')">
              {{ t('accueil.action_seconde') }}
            </NuxtLink>
          </div>

          <!--
            Compteurs calculés depuis le catalogue réel. La maquette annonçait
            « 4 200 questions justifiées » sur une banque vide : à ce stade,
            une phrase vérifiable vaut mieux qu'un chiffre flatteur.
          -->
          <dl v-if="chiffres" class="assise">
            <div><dt>{{ t('accueil.chiffre_filieres') }}</dt><dd>{{ chiffres!.filieres }}</dd></div>
            <div><dt>{{ t('accueil.chiffre_familles') }}</dt><dd>{{ chiffres!.familles }}</dd></div>
            <div><dt>{{ t('accueil.chiffre_ouvertes') }}</dt><dd>{{ chiffres!.ouvertes }}</dd></div>
          </dl>
          <p v-if="chiffres" class="assise__note">{{ t('accueil.assise_note') }}</p>
        </div>

        <!-- `tabindex="-1"` rend la cible focusable par le lien de fragment sans
             l'insérer dans l'ordre de tabulation. -->
        <div id="demonstration" tabindex="-1" class="ancre-demonstration">
          <ProofDemonstration />
        </div>
      </div>
    </section>

    <section class="section">
      <div class="enveloppe">
        <p class="oeil">{{ t('accueil.parcours_oeil') }}</p>
        <h2 class="titre-section">{{ t('accueil.parcours_titre') }}</h2>
        <ol class="etapes">
          <li v-for="n in 4" :key="n" class="etape">
            <span class="etape__n">{{ n }}</span>
            <h3 class="etape__titre">{{ t(`accueil.etape_${n}_titre`) }}</h3>
            <p class="etape__texte">{{ t(`accueil.etape_${n}_texte`) }}</p>
          </li>
        </ol>
      </div>
    </section>

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

    <!-- ─────────────────────────── LE FIL ───────────────────────────
         En bas, et c'est sa place : il prouve que la plateforme est vivante à
         qui a déjà lu la méthode. Le mettre plus haut aurait fait de l'accueil
         un agrégateur. -->
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

        <div class="fil-actu__grille">
          <CarteAnnonce v-for="annonce in fil" :key="annonce.id" :annonce="annonce" />
        </div>

        <!-- LE MARQUEUR DE FIXTURE VIENT DU SERVEUR. S'il cesse d'être servi,
             la mention disparaît — elle ne se replie pas sur une valeur en dur.
             Règle « aucun repli en dur sur un marqueur contractuel ». -->
        <p v-if="meta?.fixture" class="fil-actu__fixture" dir="auto">
          {{ t('accueil.fil_fixture', { source: meta.source }) }}
        </p>
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
.etape { background: var(--surface); border: 1px solid var(--bordure); border-radius: var(--r); padding: var(--e-4); }
.etape__n { display: inline-flex; align-items: center; justify-content: center; inline-size: 26px; block-size: 26px;
  border-radius: 999px; background: var(--vert-700); color: #fff; font-size: var(--t-xs); font-weight: 800; margin-block-end: var(--e-2); }
.etape__titre { font-size: var(--t-md); margin-block-end: 4px; }
.etape__texte { font-size: var(--t-sm); color: var(--texte-doux); }

/* `.fil-actu`, `.fil-actu__entete` et `.fil-actu__grille` viennent de
   `commun.css` : la maquette les nommait `.fil*`, nom déjà pris par le fil
   d'Ariane depuis le FRONT-1. Seule la mention de fixture est propre à cet
   écran. */
.fil-actu__fixture {
  margin-block-start: var(--e-4);
  font-size: var(--t-xs);
  color: var(--texte-doux);
}
</style>
