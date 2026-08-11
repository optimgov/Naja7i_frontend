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
</script>

<template>
  <div class="publique">
    <!-- Lien d'évitement : premier élément focusable de la page. -->
    <a class="evitement" :href="'#contenu'">{{ t('navigation.aller_au_contenu') }}</a>

    <header class="publique__entete">
      <div class="enveloppe publique__barre">
        <NuxtLink :to="localePath('/')" class="marque">
          naja<span class="marque__sept">7</span>i<em>.ma</em>
        </NuxtLink>

        <nav class="publique__nav" :aria-label="t('navigation.principale')">
          <NuxtLink :to="localePath('/concours')" class="publique__lien">
            {{ t('catalogue.concours') }}
          </NuxtLink>
        </nav>

        <div class="publique__actions">
          <NuxtLink :to="switchLocalePath(autre)" class="bascule" :lang="autre">
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

/* Visible seulement au clavier : il devient le premier arrêt du focus. */
.evitement {
  position: absolute;
  inset-block-start: -100%;
  inset-inline-start: var(--e-3);
  z-index: 10;
  padding: var(--e-2) var(--e-3);
  color: var(--texte-inverse);
  background: var(--accent);
  border-radius: var(--r);
}

.evitement:focus {
  inset-block-start: var(--e-2);
}

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

.marque {
  font-size: var(--t-lg);
  font-weight: 800;
  color: var(--texte);
  text-decoration: none;
  letter-spacing: -0.03em;
}

/* Le 7 est la lettre ح en arabizi : « naja7i » = نجاحي, « ma réussite ». */
.marque__sept {
  color: var(--safran-800);
}

.marque em {
  font-style: normal;
  font-weight: 600;
  opacity: 0.55;
}

.publique__nav {
  display: flex;
  gap: var(--e-3);
}

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
