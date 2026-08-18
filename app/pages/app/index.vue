<script setup lang="ts">
/**
 * E1 — tableau de bord : épreuve suivie, dernier diagnostic, Mission du jour.
 *
 * L'épreuve suivie vient de `GET me/attempts`, pas d'une trace de navigateur :
 * le serveur sait ce que le candidat a fait, et il répond la même chose sur
 * tous ses appareils. La version précédente s'appuyait sur `localStorage`
 * faute d'index — un tableau de bord ouvert sur un téléphone après un
 * diagnostic passé sur un poste s'affichait vide.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const { parcours, enCours, dernierePassee, estEntrainement } = useParcours()
const { ordonnance } = useOrdonnance()
const { echeances } = useMemoire()
const { epreuvesOuvertes } = useCatalogue()

const { data: liste } = await parcours()

const tentatives = computed(() => liste.value?.data ?? [])
const ouverte = computed(() => enCours(tentatives.value))
const derniere = computed(() => dernierePassee(tentatives.value))

/** L'épreuve suivie est celle de la série en cours, sinon de la dernière passée. */
const epreuve = computed(() => ouverte.value?.exam ?? derniere.value?.exam ?? null)
const code = computed(() => epreuve.value?.code ?? '')

/**
 * Mission du jour : les trois premières lignes de l'ordonnance. On demande 3,
 * on n'en affiche jamais plus de 3, et le CSS le garantit une seconde fois.
 */
const { data: plan } = await useAsyncData(
  () => `mission-${code.value || 'aucune'}`,
  async () => {
    if (!code.value) return null
    const { data } = await ordonnance(code, 3)
    return data.value
  },
  { watch: [code] },
)

const mission = computed(() => plan.value?.data?.slice(0, 3) ?? [])

/*
 * Le compte des rendez-vous échus. Il n'est pas décoratif : c'est la seule
 * chose sur cet écran qui change tous les jours, et donc la raison de revenir.
 * Zéro est une information — « rien à réviser aujourd'hui » — pas un vide.
 */
const { data: echus } = await useAsyncData(
  () => `echus-${code.value || 'aucune'}`,
  async () => {
    if (!code.value) return null
    const { data } = await echeances(code)
    return data.value
  },
  { watch: [code] },
)

const nombreEchus = computed(() => echus.value?.meta?.due_total ?? 0)

/*
 * ─────────────────────────── D-01 — LA PREMIÈRE PORTE ───────────────────────
 *
 * Un compte neuf n'a aucune tentative : `epreuve` vaut `null`, et cet écran se
 * réduisait à « Vous n'avez pas encore passé de diagnostic. » — un encart gris,
 * sans un lien ni un bouton. Le candidat s'inscrivait et repartait.
 *
 * LE DÉFAUT N'ÉTAIT PAS SEULEMENT ICI. Il n'existait, dans TOUT le produit,
 * aucun chemin d'interface d'un compte connecté vers l'écran de seuil du
 * diagnostic : ni la fiche de famille, ni la fiche de spécialité n'y menaient.
 * La recette du 17 août n'y est arrivée qu'en tapant l'adresse. Poser un lien
 * vers le catalogue aurait donc mené à un second cul-de-sac ; c'est pourquoi
 * les épreuves sont proposées ICI, chacune vers son seuil, et que
 * `CarteEpreuve` a reçu la même porte côté public.
 *
 * ON NE DEMANDE LE CATALOGUE QUE DANS L'ÉTAT VIDE. Un tableau de bord rempli
 * n'a rien à faire de la liste des épreuves ouvertes, et deux appels de plus à
 * chaque ouverture seraient payés par tous pour servir le premier jour.
 */
const { data: ouvertes } = await useAsyncData(
  () => `portes-${code.value || 'aucune'}`,
  async () => {
    if (code.value) return null
    const { data } = await epreuvesOuvertes()
    return data.value
  },
  { watch: [code] },
)

const portes = computed(() => ouvertes.value ?? [])

useHead({ title: t('app.titre') })
</script>

<template>
  <div class="enveloppe">
    <h1 class="titre-page">{{ t('app.titre') }}</h1>

    <!-- ÉTAT VIDE — et il porte sa porte. Règle des portes, clauses 1 et 2 :
         un écran qui mesure offre le geste qui le remplit, et aucun état vide
         ne se termine sans un chemin cliquable. -->
    <section v-if="!epreuve" class="debut">
      <p class="debut__constat" role="status">{{ t('app.aucun_diagnostic') }}</p>
      <h2 class="debut__titre">{{ t('app.commencer_titre') }}</h2>
      <p class="debut__texte">{{ t('app.commencer_texte') }}</p>

      <!-- Chaque épreuve ouverte est un lien vers SON seuil : le candidat lit
           ce qui est mesuré avant de lancer quoi que ce soit. -->
      <ul v-if="portes.length" class="debut__liste">
        <li v-for="porte in portes" :key="porte.code">
          <NuxtLink class="debut__porte" :to="localePath(`/app/diagnostic/${porte.code}`)">
            <span class="debut__nom" dir="auto">{{ porte.name }}</span>
            <span class="debut__famille" dir="auto">{{ porte.famille.name }}</span>
            <span v-if="porte.coefficient !== null" class="debut__coef">
              {{ t('app.coefficient') }} {{ porte.coefficient }}
            </span>
          </NuxtLink>
        </li>
      </ul>

      <!-- Catalogue illisible ou aucune famille ouverte : on n'invente aucune
           épreuve, et la sortie vers le catalogue reste — c'est le seul endroit
           qui dise la vérité sur ce qui ouvrira. -->
      <p v-else class="debut__aucune">{{ t('app.commencer_aucune') }}</p>

      <NuxtLink class="lien-second" :to="localePath('/concours')">
        {{ t('app.voir_catalogue') }}
      </NuxtLink>
    </section>

    <template v-else>
      <section class="carte-epreuve">
        <p class="oeil">{{ t('app.epreuve_suivie') }}</p>
        <h2 class="carte-epreuve__nom" dir="auto">{{ epreuve.name }}</h2>
        <p v-if="epreuve.coefficient !== null" class="carte-epreuve__coef">
          {{ t('app.coefficient') }} {{ epreuve.coefficient }}
        </p>

        <!-- Règle 9bis : le genre de la série est lu AVANT d'annoncer un score.
             Un résultat d'entraînement est annoncé comme tel, pas comme une
             note d'épreuve. -->
        <p v-if="derniere" class="dernier">
          <span class="dernier__libelle">{{ t('app.dernier_diagnostic') }}</span>
          <span v-if="estEntrainement(derniere)" class="dernier__genre">
            {{ t('correction.entrainement_avertissement') }}
          </span>
          <NuxtLink
            class="lien-second"
            :to="localePath(`/app/tentative/${derniere.uuid}/correction`)"
          >
            {{ t('correction.titre') }}
          </NuxtLink>
        </p>

        <div class="carte-epreuve__actes">
          <NuxtLink
            v-if="ouverte"
            class="btn"
            :to="localePath(`/app/tentative/${ouverte.uuid}`)"
          >
            {{ t('app.reprendre') }}
          </NuxtLink>

          <NuxtLink
            v-else
            class="btn"
            :to="localePath(`/app/diagnostic/${epreuve.code}`)"
          >
            {{ t('diagnostic.lancer') }}
          </NuxtLink>

          <NuxtLink class="lien-second" :to="localePath(`/app/entrainement/${epreuve.code}`)">
            {{ t('app.entrainement') }}
          </NuxtLink>

          <NuxtLink class="lien-second" :to="localePath(`/app/maitrise/${epreuve.code}`)">
            {{ t('app.voir_maitrise') }}
          </NuxtLink>

          <NuxtLink class="lien-second" :to="localePath(`/app/ordonnance/${epreuve.code}`)">
            {{ t('app.voir_ordonnance') }}
          </NuxtLink>
        </div>
      </section>

      <!-- Ce qui change chaque jour vient AVANT ce qui change chaque
           diagnostic : c'est la raison de revenir demain. -->
      <section class="revisions">
        <h2 class="revisions__titre">{{ t('app.revisions_titre') }}</h2>

        <p v-if="nombreEchus > 0" class="revisions__compte">
          {{ t('app.revisions_echues', { n: nombreEchus }) }}
        </p>
        <p v-else class="revisions__vide">{{ t('app.revisions_rien') }}</p>

        <NuxtLink class="btn" :to="localePath('/app/revisions')">
          {{ t('app.voir_revisions') }}
        </NuxtLink>
      </section>

      <section class="mission">
        <h2 class="mission__titre">{{ t('app.mission_titre') }}</h2>

        <!-- Vide, la mission porte quand même sa porte : ce qui la remplit est
             un diagnostic, et il est à un clic. -->
        <p v-if="!mission.length" class="mission__vide">
          <span>{{ t('app.mission_vide') }}</span>
          <NuxtLink class="lien-second" :to="localePath(`/app/diagnostic/${epreuve.code}`)">
            {{ t('diagnostic.lancer') }}
          </NuxtLink>
        </p>

        <!-- Trois actions, jamais quatre. La borne est posée deux fois : le
             `slice(0, 3)` au-dessus, et la règle CSS ci-dessous. La seconde
             tient même si un jour la première est perdue dans un refactor. -->
        <ol v-else class="mission__liste">
          <li v-for="ligne in mission" :key="ligne.node_uuid" class="mission__ligne">
            <span class="mission__domaine" dir="auto">{{ ligne.node_name }}</span>
            <span class="mission__motif">{{ t(`ordonnance.motif_${ligne.reason}`) }}</span>
            <span v-if="ligne.remediation" class="mission__remede" dir="auto">
              {{ ligne.remediation.title }}
            </span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* --- L'état vide et sa porte (D-01) --- */

.debut {
  margin-block-end: var(--e-6);
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-inline-start: 3px solid var(--accent);
  border-radius: var(--r);
}

.debut__constat { margin-block: 0 var(--e-4); font-size: var(--t-sm); color: var(--texte-doux); }
.debut__titre { margin-block: 0 var(--e-2); font-size: var(--t-lg); font-weight: 800; }
.debut__texte { max-inline-size: 60ch; margin-block: 0 var(--e-4); font-size: var(--t-sm); color: var(--texte-doux); }

.debut__liste { display: grid; gap: var(--e-2); margin: 0 0 var(--e-4); padding: 0; list-style: none; }

.debut__porte {
  display: grid;
  gap: 2px;
  /* 44 px de cible tactile : la porte se prend au doigt comme au curseur. */
  min-block-size: 44px;
  padding: var(--e-3) var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  text-decoration: none;
  color: var(--texte);
}

.debut__porte:hover { border-color: var(--accent); background: var(--accent-doux); }

.debut__nom { font-weight: 700; color: var(--lien); }
.debut__famille { font-size: var(--t-sm); color: var(--texte-doux); }
.debut__coef { font-size: var(--t-xs); color: var(--texte-doux); }

.debut__aucune { max-inline-size: 60ch; margin-block: 0 var(--e-4); font-size: var(--t-sm); color: var(--texte-doux); }

.carte-epreuve {
  margin-block-end: var(--e-6);
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.carte-epreuve__nom { margin-block: 0 var(--e-1); font-size: var(--t-xl); font-weight: 800; }
.carte-epreuve__coef { margin-block: 0 var(--e-4); font-size: var(--t-xs); color: var(--texte-doux); }

.dernier {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-3);
  align-items: baseline;
  margin-block: 0 var(--e-4);
  font-size: var(--t-sm);
}

.dernier__libelle { font-weight: 700; }
.dernier__genre { color: var(--peda-remede-texte); }

.carte-epreuve__actes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-4);
  align-items: center;
}

.revisions {
  margin-block-end: var(--e-6);
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-inline-start: 3px solid var(--peda-remede);
  border-radius: var(--r);
}

.revisions__titre { margin-block: 0 var(--e-2); font-size: var(--t-lg); font-weight: 800; }
.revisions__compte { margin-block: 0 var(--e-4); font-size: var(--t-xl); font-weight: 800; }
.revisions__vide { margin-block: 0 var(--e-4); color: var(--texte-doux); }

.mission__titre { margin-block: 0 var(--e-3); font-size: var(--t-lg); font-weight: 800; }

.mission__vide {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-3);
  align-items: baseline;
  max-inline-size: 60ch;
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

.mission__liste { display: grid; gap: var(--e-3); margin: 0; padding: 0; list-style: none; }

/* Trois actions, jamais quatre — propriété du composant, pas de l'appelant.
   Une mission qui en afficherait cinq cesserait d'être une mission. */
.mission__liste > :nth-child(n + 4) { display: none; }

.mission__ligne {
  display: grid;
  gap: 2px;
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-inline-start: 3px solid var(--accent);
  border-radius: var(--r);
}

.mission__domaine { font-weight: 700; }
.mission__motif { font-size: var(--t-sm); color: var(--texte-doux); }
.mission__remede { font-size: var(--t-xs); color: var(--peda-remede-texte); }
</style>
