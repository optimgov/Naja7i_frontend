<script setup lang="ts">
/**
 * E1 — tableau de bord : épreuve suivie, dernier diagnostic, Mission du jour.
 *
 * L'épreuve suivie vient de `GET me/attempts`, pas d'une trace de navigateur :
 * le serveur sait ce que le candidat a fait, et il répond la même chose sur
 * tous ses appareils. La version précédente s'appuyait sur `localStorage`
 * faute d'index — un tableau de bord ouvert sur un téléphone après un
 * diagnostic passé sur un poste s'affichait vide.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE MUR EST UN CHAMP — lot M-009, et c'est cet écran qui le montre le mieux
 *
 * Cet écran affichait DEUX chiffres fabriqués, tous deux nés du même `?? 0` :
 *
 *   · `nombreEchus` valait 0 quand le serveur ne rendait PAS `due_total` —
 *     c'est-à-dire quand la séance mémoire n'était pas dans l'accès. Le
 *     candidat lisait « rien à réviser aujourd'hui », une affirmation fausse
 *     sur son propre calendrier, et un bouton « voir mes révisions » qui
 *     l'aurait mené à un 403 ;
 *   · la Mission du jour se réduisait à « lancez un diagnostic » quand le
 *     serveur ne rendait pas d'ordonnance — un conseil pédagogique inventé à
 *     la place d'une fonction non souscrite.
 *
 * Les deux blocs DISPARAISSENT maintenant quand le champ est absent, et ne
 * disparaissent pas quand il vaut zéro : zéro est une information, l'absence
 * n'en est pas une. C'est toute la distinction que `rendue()` et `rendues()`
 * portent, et c'est pourquoi elles testent `data`, jamais sa longueur.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ÉTAT COMMERCIAL EST LU, PAS DÉDUIT — ADR-0033
 *
 * `me/subscription` est demandé ici pour une raison qui n'est pas la
 * permission : les trois états et, surtout, la SORTIE d'un compte épuisé
 * n'existent que là. Un compte épuisé qui ne trouverait sur cet écran ni son
 * passé ni une issue serait le pire écran du produit ; la mission le dit en
 * ces termes.
 *
 * Les capacités arrivent dans la même réponse. S'en servir pour ne pas
 * proposer une série ciblée qu'on sait refusée n'est donc pas une sonde
 * ajoutée : c'est la lecture qu'on tenait déjà. Voir `useAcces` pour le
 * raisonnement complet.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const { parcours, enCours, dernierePassee, estEntrainement } = useParcours()
const { ordonnance, rendue } = useOrdonnance()
const { echeances, rendues } = useMemoire()
const { epreuvesOuvertes } = useCatalogue()
const { acces } = useAcces()
const { user } = useAuth()

/*
 * UN LYCÉEN N'EST PAS UN CANDIDAT AU CONCOURS, et cet écran le traitait comme
 * tel. Sans diagnostic passé, il lisait « Vous n'avez pas encore passé de
 * diagnostic », puis les trois épreuves du CRMEF, puis « Parcourir le catalogue
 * des concours ». Un élève de tronc commun repartait donc de son tableau de
 * bord avec, pour seul chemin, un concours de recrutement d'enseignants.
 *
 * Le drapeau vient du serveur — c'est lui qui tient la liste fermée des
 * niveaux — et non d'une règle redéduite ici.
 */
const estLyceen = computed(() => Boolean(user.value?.est_lyceen))

const {
  lu: accesLu,
  ouvre,
  etat: etatCompte,
  etatLabel,
  sortie,
} = await acces()

const epuise = computed(() => etatCompte.value === 'epuise')

/*
 * CE QUI OUVRE UN GESTE, ET RIEN D'AUTRE.
 *
 * `questions.answer` gouverne la COMPOSITION d'une série : sans elle, ouvrir
 * un diagnostic est refusé au service. `series.targeted` gouverne
 * l'entraînement ciblé. Ni l'une ni l'autre ne ferme une lecture, donc aucune
 * réponse ne porte de champ à leur sujet — c'est la seule raison pour laquelle
 * on les lit sur l'état plutôt que sur la donnée de l'écran.
 */
const peutComposer = computed(() => ouvre(CAPACITE.REPONDRE))
const peutSerieCiblee = computed(() => ouvre(CAPACITE.SERIE_CIBLEE))

const { data: liste } = await parcours()

const tentatives = computed(() => liste.value?.data ?? [])
const ouverte = computed(() => enCours(tentatives.value))
const derniere = computed(() => dernierePassee(tentatives.value))

/**
 * LE PASSÉ, QUE L'EXPIRATION NE DÉTRUIT PAS — S-19.
 *
 * Tentatives, corrections obtenues, rapports d'examens blancs déjà produits :
 * un compte épuisé les garde. C'est la seule chose qui reste à lui montrer
 * quand plus rien de neuf ne lui est proposé, et c'est aussi une issue — un
 * écran principal qui n'offrirait qu'une phrase serait la page sans issue que
 * la mission nomme comme le pire écran du produit.
 *
 * Le rapport d'un examen blanc et la correction d'une série ne vivent pas à la
 * même adresse : on lit le genre, on ne le devine pas.
 */
const passees = computed(() => tentatives.value.filter(a => a.status !== 'in_progress'))

function versLeResultat(a: { uuid: string, kind: string }): string {
  return a.kind === 'simulation'
    ? localePath(`/app/simulation/${a.uuid}/rapport`)
    : localePath(`/app/tentative/${a.uuid}/correction`)
}

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

/**
 * L'ordonnance a-t-elle été RENDUE ? À ne pas confondre avec « est-elle vide ».
 *
 * Rendue et vide : le candidat n'a pas encore assez répondu, et le bloc offre
 * le diagnostic qui la remplit. Non rendue : la prescription n'est pas dans
 * l'accès, et le bloc n'existe pas — ni titre, ni liste, ni invitation.
 */
const missionRendue = computed(() => rendue(plan.value))
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

/*
 * PAS DE `?? 0` ICI, ET C'EST LE POINT.
 *
 * `due_total` absent veut dire que la séance mémoire n'est pas dans l'accès :
 * les échéances restent en base — elles sont l'histoire du candidat — mais
 * rien n'en sort. Un zéro à la place annoncerait « vous êtes à jour » à
 * quelqu'un dont on ne sait rien, et proposerait un geste qui serait refusé.
 *
 * `due_total` à zéro, lui, est une vraie information : rien d'échu aujourd'hui.
 */
const revisionsRendues = computed(() => rendues(echus.value))
const nombreEchus = computed(() => echus.value?.meta?.due_total ?? null)

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
    <GuideEcran cle="app_accueil" />

    <!-- ─────────────── L'ÉTAT DU COMPTE, DIT PAR LE SERVEUR ───────────────
         Le libellé et la phrase de sortie viennent d'ADR-0033 ; ils ne sont ni
         reconstruits ni traduits ici. Aucun repli en dur : si le serveur cesse
         de les servir, ils disparaissent — les issues, elles, restent, parce
         que ce sont des liens et non une phrase. -->
    <section v-if="accesLu" class="etat-compte" :data-etat="etatCompte">
      <p class="etat-compte__ligne">
        <strong dir="auto">{{ etatLabel }}</strong>
      </p>
      <p v-if="sortie" class="etat-compte__sortie" dir="auto">{{ sortie }}</p>

      <!-- LES ISSUES D'UN COMPTE ÉPUISÉ. Rien de neuf ne lui est proposé, mais
           il n'est jamais devant une page close : son dossier, le catalogue et
           la surface d'abonnement restent à un clic. -->
      <p v-if="epuise" class="etat-compte__issues">
        <NuxtLink class="btn" :to="localePath('/app/abonnement')">
          {{ t('app.issue_abonnement') }}
        </NuxtLink>
        <NuxtLink class="lien-second" :to="{ path: localePath('/tarifs'), query: { espace: 'candidat' } }">
          {{ t('app.issue_offres') }}
        </NuxtLink>
        <NuxtLink class="lien-second" :to="{ path: localePath('/concours'), query: { espace: 'candidat' } }">
          {{ t('app.voir_catalogue') }}
        </NuxtLink>
        <NuxtLink class="lien-second" :to="localePath('/app/mon-dossier')">
          {{ t('dossier.navigation') }}
        </NuxtLink>
      </p>
    </section>

    <!-- L'état n'a pas pu être lu : on le DIT, plutôt que de laisser un écran
         mystérieusement amputé de ses gestes. La donnée disparaît, la panne se
         nomme — ce ne sont pas la même chose. -->
    <div v-else class="alerte alerte--systeme" role="alert">
      <span>{{ t('app.etat_illisible') }}</span>
    </div>

    <!-- ÉTAT VIDE — et il porte sa porte. Règle des portes, clauses 1 et 2 :
         un écran qui mesure offre le geste qui le remplit, et aucun état vide
         ne se termine sans un chemin cliquable. -->
    <section v-if="!epreuve" class="debut">
      <!--
        LE LYCÉEN A SON PROPRE DÉBUT, et il dit la vérité.

        Les arbres du lycée existent en base mais leur univers est en liste
        d'attente : aucun chapitre n'est encore relu, aucune question n'est
        encore publiée dessus. On ne lui promet donc pas un diagnostic qui
        n'existe pas, et on ne lui vend surtout pas un accès à un contenu
        absent — c'est pour cela que ce bloc n'ouvre AUCUNE porte d'achat, à la
        différence de celui du candidat au concours. Il reçoit ce qui existe
        réellement : une question corrigée à essayer, et les concours annoncés
        pour ce qu'ils sont, informatifs.
      -->
      <template v-if="estLyceen">
        <p class="debut__constat" role="status">{{ t('app.lyceen_constat') }}</p>
        <h2 class="debut__titre">{{ t('app.lyceen_titre') }}</h2>
        <p class="debut__texte">{{ t('app.lyceen_texte') }}</p>
        <p class="debut__texte">
          <NuxtLink class="btn" :to="localePath('/se-preparer')">{{ t('app.lyceen_essayer') }}</NuxtLink>
        </p>
        <NuxtLink class="lien-second" :to="{ path: localePath('/concours'), query: { espace: 'candidat' } }">
          {{ t('app.lyceen_concours') }}
        </NuxtLink>
      </template>

      <template v-else>
          <p class="debut__constat" role="status">{{ t('app.aucun_diagnostic') }}</p>

          <!-- Les portes ne s'ouvrent que si la composition est ouverte. Sans
             `questions.answer`, le serveur refuse la série : proposer les
             épreuves ferait découvrir le refus après le clic. -->
          <template v-if="peutComposer">
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
        </template>

        <!--
          CE QU'UN COMPTE NEUF POUVAIT FAIRE N'ÉTAIT DIT NULLE PART. L'état vide
          se terminait sur le catalogue seul : ni « à quoi ressemble une
          correction », ni « comment obtenir plus que le palier gratuit ». Les
          deux existent, et ce sont les deux gestes suivants d'un compte neuf.
        -->
        <p class="debut__texte">{{ t('app.decouvrir_texte') }}</p>
        <div class="debut__issues">
          <NuxtLink class="lien-second" :to="localePath('/se-preparer')">{{ t('app.decouvrir_demonstration') }}</NuxtLink>
          <NuxtLink class="lien-second" :to="localePath('/app/abonnement')">{{ t('app.decouvrir_abonnement') }}</NuxtLink>
          <NuxtLink class="lien-second" :to="{ path: localePath('/concours'), query: { espace: 'candidat' } }">
            {{ t('app.voir_catalogue') }}
          </NuxtLink>
        </div>
      </template>
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

        <!-- LES ACTES OUVERTS, ET EUX SEULS.
             Aucun bouton désactivé, aucun cadenas : ce que le palier ne rend
             pas n'est pas dans le DOM. Reprendre une série DÉJÀ ouverte n'est
             pas un acte neuf — elle ne compose rien, et le passé reste au
             candidat même quand son droit s'est fermé pendant la passation. -->
        <div class="carte-epreuve__actes">
          <NuxtLink
            v-if="ouverte"
            class="btn"
            :to="localePath(`/app/tentative/${ouverte.uuid}`)"
          >
            {{ t('app.reprendre') }}
          </NuxtLink>

          <NuxtLink
            v-else-if="peutComposer"
            class="btn"
            :to="localePath(`/app/diagnostic/${epreuve.code}`)"
          >
            {{ t('diagnostic.lancer') }}
          </NuxtLink>

          <NuxtLink
            v-if="peutSerieCiblee"
            class="lien-second"
            :to="localePath(`/app/entrainement/${epreuve.code}`)"
          >
            {{ t('app.entrainement') }}
          </NuxtLink>

          <!-- La maîtrise est une MESURE : elle se rend toujours, à la
               profondeur que le palier ouvre. C'est une décision du lot 3A.9,
               et l'écran n'a rien à y garder. -->
          <NuxtLink class="lien-second" :to="localePath(`/app/maitrise/${epreuve.code}`)">
            {{ t('app.voir_maitrise') }}
          </NuxtLink>

          <NuxtLink
            v-if="missionRendue"
            class="lien-second"
            :to="localePath(`/app/ordonnance/${epreuve.code}`)"
          >
            {{ t('app.voir_ordonnance') }}
          </NuxtLink>
        </div>
      </section>

      <!-- Ce qui change chaque jour vient AVANT ce qui change chaque
           diagnostic : c'est la raison de revenir demain.

           LE BLOC N'EXISTE QUE SI LE SERVEUR A RENDU LE COMPTE. Sans
           `memory.sessions`, il n'y a ni liste ni compteur dans la réponse, et
           l'écran ne dessine rien à leur place — c'est précisément le
           cul-de-sac que le lot 3A.9 a refusé de construire côté serveur, et
           qu'il serait absurde de reconstruire ici. -->
      <section v-if="revisionsRendues" class="revisions">
        <h2 class="revisions__titre">{{ t('app.revisions_titre') }}</h2>

        <p v-if="(nombreEchus ?? 0) > 0" class="revisions__compte">
          {{ t('app.revisions_echues', { n: nombreEchus }) }}
        </p>
        <p v-else class="revisions__vide">{{ t('app.revisions_rien') }}</p>

        <NuxtLink class="btn" :to="localePath('/app/revisions')">
          {{ t('app.voir_revisions') }}
        </NuxtLink>
      </section>

      <!-- Même règle : sans `remediation.plan`, la prescription n'est pas dans
           la réponse, et ce bloc n'existe pas. Ni titre, ni liste vide, ni
           « lancez un diagnostic » — ce dernier serait un conseil pédagogique
           inventé à la place d'une fonction non souscrite. -->
      <section v-if="missionRendue" class="mission">
        <h2 class="mission__titre">{{ t('app.mission_titre') }}</h2>

        <!-- Vide, la mission porte quand même sa porte : ce qui la remplit est
             un diagnostic, et il est à un clic — quand il est ouvert. -->
        <p v-if="!mission.length" class="mission__vide">
          <span>{{ t('app.mission_vide') }}</span>
          <NuxtLink
            v-if="peutComposer"
            class="lien-second"
            :to="localePath(`/app/diagnostic/${epreuve.code}`)"
          >
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

      <!-- ───────────── CE QUE L'EXPIRATION NE DÉTRUIT PAS — S-19 ─────────────
           Un compte épuisé garde ses tentatives, ses corrections obtenues et
           ses rapports d'examens blancs. On les lui montre ICI, sur l'écran
           principal, parce que c'est là qu'il arrive et que c'est tout ce qui
           lui reste à ouvrir. Rien de neuf n'y est proposé — ce sont des
           lectures de son passé, pas des gestes. -->
      <section v-if="epuise && passees.length" class="historique">
        <h2 class="historique__titre">{{ t('app.historique_titre') }}</h2>
        <p class="historique__texte">{{ t('app.historique_texte') }}</p>

        <ul class="historique__liste">
          <li v-for="a in passees" :key="a.uuid" class="historique__ligne">
            <NuxtLink class="historique__lien" :to="versLeResultat(a)">
              <span class="historique__epreuve" dir="auto">{{ a.exam.name }}</span>
              <span class="historique__genre">{{ t(`app.genre_${a.kind}`) }}</span>
            </NuxtLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* Les issues d'un compte neuf, en ligne et repliables — logique, jamais physique. */
.debut__issues { display: flex; flex-wrap: wrap; gap: var(--e-4); margin-block-start: var(--e-4); }
/* --- L'état du compte (ADR-0033) ---
   L'état est porté par le MOT servi par le serveur ; la bordure ne fait que
   redoubler. Même règle que l'échéance des annonces : jamais la couleur seule.
   `data-etat` sert aussi de prise à la recette — elle lit l'état rendu, elle ne
   le devine pas à la couleur. */

.etat-compte {
  display: grid;
  gap: var(--e-2);
  margin-block-end: var(--e-5);
  padding: var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-inline-start: 3px solid var(--bordure-forte);
  border-radius: var(--r);
}

.etat-compte[data-etat="actif"] { border-inline-start-color: var(--peda-juste); }
.etat-compte[data-etat="essai"] { border-inline-start-color: var(--accent); }
.etat-compte[data-etat="epuise"] { border-inline-start-color: var(--peda-remede); }

.etat-compte__ligne { margin: 0; }
.etat-compte__sortie { max-inline-size: 62ch; margin: 0; font-size: var(--t-sm); color: var(--texte-doux); }

.etat-compte__issues {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-3);
  align-items: center;
  margin: 0;
  margin-block-start: var(--e-2);
}

/* --- L'historique d'un compte épuisé (S-19) --- */

.historique {
  margin-block-end: var(--e-6);
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.historique__titre { margin-block: 0 var(--e-2); font-size: var(--t-lg); font-weight: 800; }
.historique__texte { max-inline-size: 60ch; margin-block: 0 var(--e-4); font-size: var(--t-sm); color: var(--texte-doux); }
.historique__liste { display: grid; gap: var(--e-2); margin: 0; padding: 0; list-style: none; }

.historique__lien {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-2) var(--e-3);
  align-items: baseline;
  /* 44 px de cible tactile, comme les portes de l'état vide. */
  min-block-size: 44px;
  padding: var(--e-3) var(--e-4);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
  text-decoration: none;
  color: var(--texte);
}

.historique__lien:hover { border-color: var(--accent); background: var(--accent-doux); }
.historique__epreuve { flex: 1 1 12rem; font-weight: 700; color: var(--lien); }
.historique__genre { font-size: var(--t-sm); color: var(--texte-doux); }

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
