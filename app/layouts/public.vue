<script setup lang="ts">
/**
 * Enveloppe de la zone publique — pages indexables par les moteurs.
 *
 * Elle diffère du layout `auth` par sa fonction : `auth` isole le candidat dans
 * un tunnel sans issue latérale, celle-ci fait l'inverse — un visiteur arrive
 * par une recherche et doit pouvoir circuler.
 *
 * `useLangueEtDirection()` remplace le `useHead({ htmlAttrs: computed(...) })`
 * du FRONT-1, dont le typage était rouge.
 */
const { locale, locales, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const localePath = useLocalePath()

useLangueEtDirection()

const autre = computed(() => (locale.value === 'fr' ? 'ar' : 'fr'))
const nomAutre = computed(
  () => locales.value.find((l: { code: string }) => l.code === autre.value)?.name ?? '',
)

/*
 * LE COMPTEUR DE LA PASTILLE, calculé une fois pour les deux navigations.
 *
 * Il vit dans le GABARIT et non dans chaque composant : deux lectures
 * donneraient deux nombres le jour où l'une échoue, et l'en-tête afficherait
 * alors autre chose que la barre basse. `useAsyncData` déduplique par clé,
 * donc une seule requête sert les deux.
 *
 * NUL EN CAS D'ÉCHEC, jamais zéro. `useAsyncData` place `undefined` dans
 * `error` — on teste la véracité. Un « 0 » affiché serait une affirmation
 * fausse ; l'absence de pastille ne dit rien, ce qui est exact.
 */
const { annonces } = useOpportunites()
const { data: opportunites, error: erreurOpportunites } = await annonces()

const ouvertes = computed(() => {
  if (erreurOpportunites.value || !opportunites.value) return null
  return opportunites.value.data.filter(a => estOuverte(a)).length
})
</script>

<template>
  <div class="publique">
    <!-- Lien d'évitement : premier élément focusable de la page. -->
    <a class="evitement" :href="'#contenu'">{{ t('navigation.aller_au_contenu') }}</a>

    <header class="publique__entete">
      <div class="enveloppe publique__barre">
        <NuxtLink :to="localePath('/')" class="publique__logo">
          <LogoNaja7i />
        </NuxtLink>

        <NavPublique :ouvertes="ouvertes" />

        <div class="publique__actions peau__actes">
          <!-- La bascule de thème reste dans le rang du haut À TOUTES LES
               LARGEURS, et ce n'est pas une question de place : `npm run audit`
               rejoue chaque écran en sombre en CLIQUANT `[data-bascule-theme]`.
               Rangée dans un panneau fermé, elle ne serait pas cliquable, le
               clic échouerait en silence, et la passe « sombre » mesurerait le
               thème clair en le déclarant conforme. Voir MenuPlus. -->
          <BasculeTheme />

          <!-- Sous 62 rem, la langue vit dans le menu « Plus ». -->
          <NuxtLink
            :to="switchLocalePath(autre)"
            class="bascule bascule--langue"
            data-bascule-langue
            :lang="autre"
          >
            {{ nomAutre }}
          </NuxtLink>

          <NuxtLink :to="localePath('/connexion')" class="btn btn--discret">
            {{ t('navigation.connexion') }}
          </NuxtLink>

          <!-- Sous 62 rem seulement : la barre basse porte les cinq entrées,
               celui-ci porte le reste — et rien qui ne réponde pas. -->
          <MenuPlus />
        </div>
      </div>
    </header>

    <main id="contenu" class="publique__contenu">
      <slot />
    </main>

    <!-- Sous 62 rem, la nav du haut cède la place à celle-ci. Voir BarreBasse. -->
    <BarreBasse :ouvertes="ouvertes" />

    <PiedPublique />
  </div>
</template>

<style scoped>
.publique {
  display: flex;
  flex-direction: column;
  min-block-size: 100dvh;
  background: var(--fond);
}

/* `.evitement` était défini ici ET dans commun.css — deux règles pour une même
   classe, celle-ci l'emportant par la spécificité du scope. Elle posait
   `--texte-inverse` sur `--accent`, la composition qui tombe à 2,11:1 en thème
   sombre. La règle partagée de commun.css est la seule qui subsiste. */

/* `position: relative` fait de l'en-tête le repère du méga-menu : le panneau
   s'ancre sur TOUTE la largeur de la barre, pas sur son déclencheur. Sans lui,
   il se positionnerait par rapport à la fenêtre et sortirait du cadre au
   défilement. */
.publique__entete {
  position: relative;
  border-block-end: 1px solid var(--bordure);
  background: var(--surface);
}

.publique__barre {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--e-3);
  padding-block: var(--e-3);
}

/* Le mot-symbole et son 7 en arabizi vivent maintenant dans `LogoNaja7i.vue`,
   avec la tuile. Ils étaient écrits deux fois — ici et dans le gabarit
   d'authentification — avec deux safrans différents (--safran-800 d'un côté,
   --safran de l'autre) : la marque n'avait pas la même couleur selon qu'on
   était connecté ou non. */
.publique__logo {
  display: inline-flex;
  text-decoration: none;
}

.publique__logo:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/* `.publique__nav` a cédé la place à `NavPublique` (A1). */

.publique__lien {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--texte-doux);
  text-decoration: none;
}

.publique__lien:hover {
  color: var(--texte);
}

/* `margin-inline-start: auto` pousse le bloc vers la fin de ligne — donc à
   droite en français et à gauche en arabe, sans règle supplémentaire. */
.publique__actions {
  display: flex;
  align-items: center;
  gap: var(--e-2);
  margin-inline-start: auto;
}

.bascule {
  padding: var(--e-1) var(--e-2);
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--texte-doux);
  text-decoration: none;
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.bascule:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.publique__contenu {
  flex: 1;
}




:where(.publique) a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
