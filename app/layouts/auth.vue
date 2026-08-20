<script setup lang="ts">
const { locale, locales, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const autre = computed(() => (locale.value === 'fr' ? 'ar' : 'fr'))
const nomAutre = computed(
  () => locales.value.find((l) => l.code === autre.value)?.name ?? '',
)

// REVUE FRONT-1 : `htmlAttrs` attend un objet aux valeurs réactives, pas un
// ComputedRef enveloppant l'objet entier. Le composable porte la forme juste.
useLangueEtDirection()

// Connexion, inscription, mot de passe, vérification d'e-mail : aucun de ces
// écrans n'a de raison d'être indexé. La politique est écrite une fois, dans
// `useNonIndexable`, et ce gabarit la porte pour toutes ses pages.
useNonIndexable()
</script>

<template>
  <div class="portail">
    <!-- Panneau de marque : la promesse, pas un argumentaire. -->
    <aside class="portail__marque">
      <NuxtLink :to="`/${locale}`" class="portail__logo">
        <LogoNaja7i inverse />
      </NuxtLink>

      <p class="portail__promesse">{{ t('marque.promesse') }}</p>

      <p class="portail__precision">{{ t('marque.precision') }}</p>
    </aside>

    <main class="portail__contenu">
      <div class="portail__barre">
        <!-- `data-bascule-langue` et `data-bascule-theme` sont les points
             d'accroche de `auditer.mjs`. Le premier ne sert pas à basculer la
             langue en RTL — la langue est un préfixe de route, donc une autre
             URL — mais à retrouver la commande sur la capture. -->
        <BasculeTheme />

        <NuxtLink
          :to="switchLocalePath(autre)"
          class="portail__langue"
          data-bascule-langue
          :lang="autre"
        >
          {{ nomAutre }}
        </NuxtLink>
      </div>

      <div class="portail__carte">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.portail {
  display: grid;
  min-block-size: 100dvh;
  grid-template-columns: 1fr;
}

@media (min-width: 62rem) {
  .portail {
    grid-template-columns: minmax(20rem, 34%) 1fr;
  }
}

.portail__marque {
  display: flex;
  flex-direction: column;
  gap: var(--e-3);
  justify-content: center;
  padding: var(--e-5);
  color: var(--texte-inverse);
  background: var(--vert-800);
}

@media (min-width: 62rem) {
  .portail__marque {
    padding: var(--e-7) var(--e-6);
  }
}

.portail__logo {
  align-self: flex-start;
  text-decoration: none;
}

.portail__promesse {
  max-inline-size: 24ch;
  margin: 0;
  font-size: var(--t-xl);
  font-weight: 600;
  line-height: 1.3;
}

.portail__precision {
  max-inline-size: 34ch;
  margin: 0;
  font-size: var(--t-sm);
  /* 0,72 d'opacité sur --texte-inverse tombait à 4,2:1 sur le vert profond.
     Le jeton doux du thème inverse tient la mesure sans rien éteindre. */
  color: var(--texte-inverse-doux);
}

.portail__contenu {
  display: flex;
  flex-direction: column;
  padding: var(--e-3);
}

.portail__barre {
  display: flex;
  gap: var(--e-2);
  align-items: center;
  justify-content: flex-end;
}

.portail__langue {
  display: inline-flex;
  align-items: center;
  min-block-size: 34px;
  padding: 0 var(--e-3);
  font-size: var(--t-xs);
  font-weight: 600;
  color: var(--texte-doux);
  text-decoration: none;
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.portail__langue:hover {
  color: var(--accent);
  border-color: var(--accent);
}

.portail__langue:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.portail__carte {
  inline-size: 100%;
  max-inline-size: 26rem;
  margin-block: auto;
  margin-inline: auto;
  padding-block: var(--e-5);
}
</style>
