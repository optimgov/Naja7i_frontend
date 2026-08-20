<script setup lang="ts">
import type { EpreuveOuverte } from '~/composables/useCatalogue'

/**
 * `/se-preparer` — LA PORTE PUBLIQUE QUI MANQUAIT.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QU'ELLE N'EST PAS
 *
 * Ce n'est pas un tableau de bord candidat en accès libre. Elle ne mesure rien,
 * elle n'affiche aucune progression, elle ne connaît personne. Elle EXPLIQUE
 * puis elle DÉCLENCHE — c'est tout ce qu'une surface publique peut faire
 * honnêtement quand le diagnostic réel vit derrière une session vérifiée.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES ÉPREUVES SONT CELLES QUI SONT RÉELLEMENT OUVERTES
 *
 * `epreuvesOuvertes()` ne retient que les familles `open` et laisse tomber
 * celles dont la fiche est illisible — elles ne valent pas zéro épreuve.
 * Aucune liste n'est écrite ici : une porte inventée est une porte qui rend
 * 404 à celui qui la pousse.
 *
 * DEUX ÉTATS VIDES, ET ILS NE DISENT PAS LA MÊME CHOSE :
 *
 *   catalogue ILLISIBLE  — on ne sait pas. On le dit, et on laisse la porte du
 *                          catalogue, qui est la seule chose encore vraie.
 *   catalogue LU, VIDE   — aucune épreuve n'est ouverte aujourd'hui. C'est un
 *                          fait, et il s'énonce comme un fait.
 *
 * Les confondre reviendrait à affirmer « rien n'est ouvert » à chaque panne
 * d'API, c'est-à-dire à décourager un candidat au moment exact où l'on est le
 * moins capable de le renseigner.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE LIEN VA DIRECTEMENT AU SEUIL DU DIAGNOSTIC, ET C'EST VOULU
 *
 * `/app/diagnostic/{code}` est sous `middleware: 'auth'`, qui emporte désormais
 * la destination dans `?suite=`. Un visiteur y est donc conduit à la connexion,
 * puis ramené sur SON épreuve — sans que cette page ait à deviner s'il a une
 * session. Or elle ne peut pas le deviner : rien n'appelle `fetchMe()` sur une
 * surface publique, et l'y appeler coûterait une requête d'API à chaque rendu
 * d'une page faite pour être indexée et mise en cache.
 *
 * Fabriquer ici un `/connexion?suite=…` pour un visiteur supposé anonyme aurait
 * donc renvoyé un candidat DÉJÀ connecté vers un formulaire de connexion, pour
 * la seule raison qu'on avait mal deviné.
 *
 * LA FRICTION EST DITE EN TOUTES LETTRES : compte ET adresse vérifiée. Les
 * routes `me/diagnostics/{code}` portent `auth:sanctum` ET `verified.api` —
 * promettre « quelques secondes » serait faux d'une étape entière.
 */
definePageMeta({ layout: 'public' })

const { t } = useI18n()
const localePath = useLocalePath()

const { epreuvesOuvertes } = useCatalogue()
const { data: epreuves, error: erreurCatalogue } = await epreuvesOuvertes()

const illisible = computed(() => Boolean(erreurCatalogue.value) || epreuves.value == null)

/**
 * Groupées par famille, dans l'ordre où le catalogue les a servies.
 *
 * Une `Map` conserve l'ordre d'insertion : c'est celui du contrat, donc celui
 * que la conception du catalogue a décidé. Trier par nom ici imposerait un
 * second classement, propre à cet écran, qui divergerait du reste du site.
 */
const parFamille = computed(() => {
  const groupes = new Map<string, { nom: string, epreuves: EpreuveOuverte[] }>()

  for (const epreuve of epreuves.value ?? []) {
    const cle = epreuve.famille.slug
    if (!groupes.has(cle)) groupes.set(cle, { nom: epreuve.famille.name, epreuves: [] })
    groupes.get(cle)!.epreuves.push(epreuve)
  }

  return [...groupes.entries()].map(([slug, groupe]) => ({ slug, ...groupe }))
})

const aucune = computed(() => !illisible.value && parFamille.value.length === 0)

/** Les trois preuves de méthode. Le contenu est réel, pas un gabarit à remplir. */
const PREUVES = ['autopsie', 'distracteurs', 'assise'] as const

useSeoCatalogue({
  title: t('preparer.seo_titre'),
  description: t('preparer.seo_description'),
  path: '/se-preparer',
})
</script>

<template>
  <div>
    <!-- ═══════════ BLOC 1 — le choix, tout de suite — V4 §5 ═══════════
         La promesse occupait une section pleine hauteur AVANT la liste : à
         390 px, le premier écran ne montrait aucune épreuve. Le cahier est
         explicite — « le premier écran répond à une seule question : quelle
         épreuve voulez-vous préparer ? ». Titre et liste fusionnent donc en
         une seule section, et le chapeau tombe : le H1 le dit déjà. -->
    <section id="epreuves" class="section preparer__tete" tabindex="-1">
      <div class="enveloppe">
        <p class="oeil">{{ t('preparer.oeil') }}</p>
        <h1 class="preparer__titre">{{ t('preparer.titre') }}</h1>
        <p class="preparer__friction">{{ t('preparer.friction') }}</p>

        <!-- Catalogue illisible : on ne sait pas, et on ne fabrique pas une
             liste vide qui se lirait « rien n'est ouvert ». -->
        <template v-if="illisible">
          <p class="preparer__vide">{{ t('preparer.catalogue_illisible') }}</p>
          <NuxtLink class="btn btn--fantome" :to="localePath('/concours')">
            {{ t('preparer.voir_catalogue') }}
          </NuxtLink>
        </template>

        <!-- Catalogue lu, et réellement vide. C'est un fait, il s'énonce. -->
        <template v-else-if="aucune">
          <p class="preparer__vide">{{ t('preparer.aucune_epreuve') }}</p>
          <NuxtLink class="btn btn--fantome" :to="localePath('/concours')">
            {{ t('preparer.voir_catalogue') }}
          </NuxtLink>
        </template>

        <template v-else>
          <div v-for="famille in parFamille" :key="famille.slug" class="preparer__famille">
            <h3 class="preparer__famille-nom" dir="auto">{{ famille.nom }}</h3>

            <ul class="preparer__liste">
              <li v-for="epreuve in famille.epreuves" :key="epreuve.code">
                <NuxtLink
                  class="preparer__porte"
                  :to="localePath(`/app/diagnostic/${epreuve.code}`)"
                >
                  <span class="preparer__nom" dir="auto">{{ epreuve.name }}</span>
                  <span v-if="epreuve.coefficient !== null" class="preparer__coef">
                    {{ t('app.coefficient') }} {{ epreuve.coefficient }}
                  </span>
                </NuxtLink>
              </li>
            </ul>

            <p class="preparer__famille-lien">
              <NuxtLink class="lien-second" :to="localePath(`/concours/famille/${famille.slug}`)">
                {{ t('preparer.voir_famille') }}
              </NuxtLink>
            </p>
          </div>
        </template>
      </div>
    </section>

    <!-- ═════════ BLOC 2 — la démonstration, le MÊME composant qu'à l'accueil ═ -->
    <section class="section">
      <div class="enveloppe preparer__demo">
        <div>
          <h2 class="titre-section">{{ t('preparer.demo_titre') }}</h2>
          <p class="preparer__demo-texte">{{ t('preparer.demo_texte') }}</p>
        </div>

        <ProofDemonstration contexte="preparer" />
      </div>
    </section>

    <!-- ═══════════════════ BLOC 3 — les trois preuves ════════════════════ -->
    <section class="section section--douce">
      <div class="enveloppe">
        <p class="oeil">{{ t('preparer.methode_oeil') }}</p>
        <h2 class="titre-section">{{ t('preparer.methode_titre') }}</h2>

        <div class="grille grille--3 preparer__preuves">
          <article v-for="preuve in PREUVES" :key="preuve" class="preparer__preuve">
            <h3 class="preparer__preuve-titre">{{ t(`preparer.preuve_${preuve}_titre`) }}</h3>
            <p class="preparer__preuve-texte">{{ t(`preparer.preuve_${preuve}_texte`) }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- ═════════ BLOC 4 — la frontière, sans recopier un seul prix ═══════ -->
    <section class="section">
      <div class="enveloppe preparer__frontiere">
        <h2 class="titre-section">{{ t('preparer.frontiere_titre') }}</h2>
        <p class="preparer__frontiere-texte">{{ t('preparer.frontiere_gratuit') }}</p>
        <p class="preparer__frontiere-texte">{{ t('preparer.frontiere_paye') }}</p>

        <!-- AUCUN PRIX ICI. Les offres sont servies par `/plans` et rendues par
             `/tarifs` ; un tarif recopié dans un gabarit vieillit en silence, et
             sur un prix affiché la divergence est une promesse rompue. -->
        <NuxtLink class="btn btn--fantome" :to="localePath('/tarifs')">
          {{ t('preparer.frontiere_lien') }}
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.preparer__tete { padding-block: var(--e-7) var(--e-5); }
.preparer__titre { font-size: var(--t-4xl); max-inline-size: 18ch; text-wrap: balance; }

.titre-section { font-size: var(--t-2xl); margin-block-end: var(--e-3); }

.preparer__friction {
  max-inline-size: 64ch;
  margin-block-end: var(--e-5);
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

.preparer__vide {
  max-inline-size: 64ch;
  margin-block-end: var(--e-4);
  color: var(--texte-doux);
}

.preparer__famille { margin-block-end: var(--e-6); }
.preparer__famille:last-child { margin-block-end: 0; }

.preparer__famille-nom {
  margin-block: 0 var(--e-3);
  font-size: var(--t-lg);
  font-weight: 800;
}

.preparer__liste {
  display: grid;
  gap: var(--e-2);
  margin: 0;
  padding: 0;
  list-style: none;
  grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
}

/* 44 px de cible tactile, comme toutes les portes de ce dépôt. */
.preparer__porte {
  display: grid;
  gap: 2px;
  min-block-size: 44px;
  padding: var(--e-3) var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  text-decoration: none;
  color: var(--texte);
}

.preparer__porte:hover { border-color: var(--accent); background: var(--accent-doux); }

.preparer__nom { font-weight: 700; color: var(--lien); }
.preparer__coef { font-size: var(--t-xs); color: var(--texte-doux); }

.preparer__famille-lien { margin-block: var(--e-3) 0; }

.preparer__demo { display: grid; gap: var(--e-5); align-items: start; }
@media (min-width: 56rem) { .preparer__demo { grid-template-columns: 1fr 1fr; gap: var(--e-6); } }

.preparer__demo-texte { max-inline-size: 46ch; color: var(--texte-doux); }

.preparer__preuves { margin-block-start: var(--e-5); }

.preparer__preuve {
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.preparer__preuve-titre { font-size: var(--t-md); margin-block-end: var(--e-2); }
.preparer__preuve-texte { font-size: var(--t-sm); color: var(--texte-doux); }

.preparer__frontiere { max-inline-size: 64ch; }
.preparer__frontiere-texte { color: var(--texte-doux); }
</style>
