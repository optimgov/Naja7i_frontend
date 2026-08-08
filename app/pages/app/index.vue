<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const { t, locale } = useI18n()
const { user, logout } = useAuth()

useHead({
  title: t('espace.titre'),
  htmlAttrs: computed(() => ({ lang: locale.value, dir: locale.value === 'ar' ? 'rtl' : 'ltr' })),
})
</script>

<template>
  <!--
    Écran de contrôle, pas un tableau de bord. Sa seule fonction est de prouver
    que la session traverse le BFF : si cette page affiche l'adresse du candidat
    et son état de vérification, toute la chaîne de cookies fonctionne.
    Il sera remplacé par le vrai espace candidat au lot suivant.
  -->
  <main class="espace">
    <header class="espace__entete">
      <span class="marque">naja<span class="marque__sept">7</span>i<em>.ma</em></span>
      <button class="lien-deconnexion" @click="logout">{{ t('espace.deconnexion') }}</button>
    </header>

    <h1>{{ t('espace.titre') }}</h1>
    <p class="espace__intro">{{ t('espace.intro') }}</p>

    <dl class="etat">
      <div class="etat__ligne">
        <dt>{{ t('champs.email') }}</dt>
        <dd>{{ user?.email }}</dd>
      </div>
      <div class="etat__ligne">
        <dt>{{ t('espace.verification') }}</dt>
        <dd>
          <span :class="['pastille', user?.email_verified ? 'pastille--ok' : 'pastille--attente']">
            {{ user?.email_verified ? t('espace.verifie') : t('espace.non_verifie') }}
          </span>
        </dd>
      </div>
      <div class="etat__ligne">
        <dt>{{ t('espace.roles') }}</dt>
        <dd>{{ user?.roles?.join(', ') || '—' }}</dd>
      </div>
      <div class="etat__ligne">
        <dt>{{ t('espace.identifiant') }}</dt>
        <dd class="etat__uuid">{{ user?.uuid }}</dd>
      </div>
    </dl>
  </main>
</template>

<style scoped>
.espace {
  max-inline-size: 42rem;
  padding: var(--espace-4) var(--espace-3);
  margin-inline: auto;
}

.espace__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-block-end: var(--espace-5);
}

.marque { font-weight: 800; letter-spacing: -0.03em; }
.marque__sept { color: var(--terre-cuite); }
.marque em { font-style: normal; opacity: 0.5; font-weight: 600; }

.lien-deconnexion {
  padding: 0;
  font: inherit;
  font-size: var(--taille-s);
  color: var(--texte-doux);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  background: none;
  border: none;
}

.espace__intro { color: var(--texte-doux); font-size: var(--taille-s); margin-block-end: var(--espace-4); }

.etat {
  margin: 0;
  border: 1px solid var(--bordure);
  border-radius: var(--rayon);
  background: var(--fond-eleve);
}

.etat__ligne {
  display: grid;
  gap: var(--espace-2);
  padding: var(--espace-3);
  border-block-end: 1px solid var(--bordure);
}

@media (min-width: 40rem) {
  .etat__ligne { grid-template-columns: 12rem 1fr; }
}

.etat__ligne:last-child { border-block-end: none; }

.etat dt { font-size: var(--taille-s); font-weight: 600; color: var(--texte-doux); }
.etat dd { margin: 0; }
.etat__uuid { font-family: ui-monospace, monospace; font-size: var(--taille-xs); word-break: break-all; }

.pastille {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  font-size: var(--taille-xs);
  font-weight: 700;
  border-radius: 999px;
}

.pastille--ok { color: var(--vert-fonce); background: #eef8f4; }
.pastille--attente { color: var(--terre-cuite); background: #fdf1eb; }
</style>
