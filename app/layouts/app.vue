<script setup lang="ts">
/**
 * Gabarit de la zone candidat.
 *
 * Il porte les trois choses qui doivent exister sur TOUS les écrans de la
 * boucle, passation comprise : le bandeau de coupure réseau, la reprise de
 * session après 401, et la reprise de la file d'envoi au montage.
 *
 * La file est relue au montage parce qu'un rechargement ne doit rien perdre :
 * les réponses posées hors connexion survivent dans `localStorage` et repartent
 * dès qu'on revient.
 */
const { locale, locales, t } = useI18n()
const localePath = useLocalePath()
const switchLocalePath = useSwitchLocalePath()
const { logout } = useAuth()

const autre = computed(() => (locale.value === 'fr' ? 'ar' : 'fr'))
const nomAutre = computed(() => locales.value.find((l) => l.code === autre.value)?.name ?? '')

useLangueEtDirection()

// L'espace candidat n'existe que pour la personne connectée : rien n'y est
// indexable, et un robot qui suivrait ses liens n'y trouverait que des
// redirections vers la connexion. Même politique que le gabarit `auth`.
useNonIndexable()

const reseau = useReseau()
const file = useFileEnvoi()

onMounted(async () => {
  reseau.ecouter()
  file.reprendre()
  // Une file migrée de la version 1 n'a pas de propriétaire : le premier
  // utilisateur identifié l'adopte, ce qui préserve les réponses d'un candidat
  // déjà en passation au moment du déploiement.
  await file.adopter()
  // Le réseau est peut-être revenu pendant que l'onglet était fermé.
  await file.ecouler()
})

// Le retour du réseau déclenche l'écoulement : c'est le moment exact où les
// réponses en attente peuvent enfin partir.
watch(
  () => reseau.enLigne.value,
  async (enLigne) => {
    if (enLigne) await file.ecouler()
  },
)
</script>

<template>
  <div class="appli">
    <a class="evitement" href="#contenu">{{ t('navigation.aller_au_contenu') }}</a>

    <BandeauHorsConnexion />

    <header class="appli__entete">
      <div class="enveloppe appli__barre">
        <NuxtLink :to="localePath('/app')" class="appli__logo">
          <LogoNaja7i />
        </NuxtLink>

        <div class="appli__actions">
          <BasculeTheme />

          <NuxtLink
            :to="switchLocalePath(autre)"
            class="btn btn--discret"
            data-bascule-langue
            :lang="autre"
          >
            {{ nomAutre }}
          </NuxtLink>

          <button type="button" class="btn btn--discret" @click="logout">
            {{ t('espace.deconnexion') }}
          </button>
        </div>
      </div>
    </header>

    <main id="contenu" class="appli__contenu">
      <!-- La boîte d'échec précède le contenu : ce qui bloque la suite se lit
           avant ce qu'on allait faire. -->
      <div class="enveloppe">
        <BoiteEchecs />
      </div>

      <slot />
    </main>

    <ReprendreSession />
  </div>
</template>

<style scoped>
.appli {
  display: flex;
  flex-direction: column;
  min-block-size: 100dvh;
  background: var(--fond);
}

.appli__entete {
  border-block-end: 1px solid var(--bordure);
  background: var(--surface);
}

.appli__barre {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--e-3);
  padding-block: var(--e-3);
}

.appli__logo {
  display: inline-flex;
  text-decoration: none;
}

.appli__logo:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.appli__actions {
  display: flex;
  align-items: center;
  gap: var(--e-2);
}

.appli__contenu {
  flex: 1;
  padding-block: var(--e-5);
}
</style>
