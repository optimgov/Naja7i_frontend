<script setup lang="ts">
const { locale, locales, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const autre = computed(() => (locale.value === 'fr' ? 'ar' : 'fr'))
const nomAutre = computed(
  () => locales.value.find((l: any) => l.code === autre.value)?.name ?? '',
)

useHead({
  htmlAttrs: computed(() => ({
    lang: locale.value,
    dir: locale.value === 'ar' ? 'rtl' : 'ltr',
  })),
})
</script>

<template>
  <div class="portail">
    <!-- Panneau de marque : la promesse, pas un argumentaire. -->
    <aside class="portail__marque">
      <NuxtLink :to="`/${locale}`" class="marque">
        naja<span class="marque__sept">7</span>i<em>.ma</em>
      </NuxtLink>

      <p class="portail__promesse">{{ t('marque.promesse') }}</p>

      <p class="portail__precision">{{ t('marque.precision') }}</p>
    </aside>

    <main class="portail__contenu">
      <div class="portail__barre">
        <NuxtLink :to="switchLocalePath(autre)" class="bascule" :lang="autre">
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
  gap: var(--espace-3);
  justify-content: center;
  padding: var(--espace-4) var(--espace-4);
  color: var(--texte-inverse);
  background: var(--vert-fonce);
}

@media (min-width: 62rem) {
  .portail__marque {
    padding: var(--espace-6) var(--espace-5);
  }
}

.marque {
  font-size: var(--taille-l);
  font-weight: 800;
  color: var(--texte-inverse);
  text-decoration: none;
  letter-spacing: -0.03em;
}

/* Le 7 est la lettre ح en arabizi : « naja7i » = نجاحي, « ma réussite ».
   Il porte la terre cuite de la charte — le seul accent coloré de l'écran. */
.marque__sept { color: var(--safran); }
.marque em { font-style: normal; opacity: 0.55; font-weight: 600; }

.portail__promesse {
  max-inline-size: 24ch;
  margin: 0;
  font-size: var(--taille-l);
  font-weight: 600;
  line-height: 1.3;
}

.portail__precision {
  max-inline-size: 34ch;
  margin: 0;
  font-size: var(--taille-s);
  opacity: 0.72;
}

.portail__contenu {
  display: flex;
  flex-direction: column;
  padding: var(--espace-3);
}

.portail__barre {
  display: flex;
  justify-content: flex-end;
}

.bascule {
  padding: var(--espace-1) var(--espace-2);
  font-size: var(--taille-s);
  font-weight: 600;
  color: var(--texte-doux);
  text-decoration: none;
  border: 1px solid var(--bordure);
  border-radius: var(--rayon-s);
}

.bascule:hover { border-color: var(--vert-profond); color: var(--vert-profond); }

.portail__carte {
  inline-size: 100%;
  max-inline-size: 26rem;
  margin-block: auto;
  margin-inline: auto;
  padding-block: var(--espace-4);
}
</style>
