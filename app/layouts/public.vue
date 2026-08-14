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

const annee = new Date().getFullYear()

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
          <BasculeTheme />

          <NuxtLink
            :to="switchLocalePath(autre)"
            class="bascule"
            data-bascule-langue
            :lang="autre"
          >
            {{ nomAutre }}
          </NuxtLink>

          <NuxtLink :to="localePath('/connexion')" class="btn btn--discret">
            {{ t('navigation.connexion') }}
          </NuxtLink>
        </div>
      </div>
    </header>

    <main id="contenu" class="publique__contenu">
      <slot />
    </main>

    <!-- Sous 62 rem, la nav du haut cède la place à celle-ci. Voir BarreBasse. -->
    <BarreBasse :ouvertes="ouvertes" />

    <footer class="publique__pied">
      <div class="enveloppe">
        <p class="publique__promesse">{{ t('marque.promesse') }}</p>

        <p class="publique__mentions">
          <!-- L'année passe par une variable : un millésime en dur vieillit
               en silence, et personne ne le corrige. -->
          {{ t('navigation.mentions', { annee }) }}
        </p>
      </div>
    </footer>
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

.publique__entete {
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

.publique__pied {
  padding-block: var(--e-5);
  border-block-start: 1px solid var(--bordure);
  background: var(--surface-douce);
}

.publique__promesse {
  margin: 0 0 var(--e-2);
  max-inline-size: 44ch;
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--texte);
}

.publique__mentions {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

:where(.publique) a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
