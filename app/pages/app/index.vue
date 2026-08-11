<script setup lang="ts">
/**
 * E1 — tableau de bord : épreuve suivie, dernier diagnostic, Mission du jour.
 *
 * D'OÙ VIENT « L'ÉPREUVE SUIVIE »
 *
 * De nulle part côté serveur : le contrat n'expose ni profil du candidat
 * (PAS-5, à venir) ni index des tentatives — seulement
 * `GET me/attempts/{uuid}`, qui suppose de connaître l'identifiant. L'écran
 * s'appuie donc sur la trace locale de `useSuivi`, puis RECHARGE tout depuis
 * l'API. La trace ne sert qu'à savoir quoi demander ; aucun chiffre n'en sort.
 *
 * Sans trace, l'écran ne suppose rien : il propose de choisir une épreuve.
 */
definePageMeta({ layout: 'app', middleware: 'auth' })

const { t } = useI18n()
const localePath = useLocalePath()
const { relire, suivi } = useSuivi()
const { ordonnance } = useOrdonnance()

onMounted(() => relire())

const code = computed(() => suivi.value?.codeEpreuve ?? '')

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

useHead({ title: t('app.titre') })
</script>

<template>
  <div class="enveloppe">
    <h1 class="titre-page">{{ t('app.titre') }}</h1>

    <!-- Aucune épreuve suivie : on ne suppose rien, on ouvre le catalogue. -->
    <div v-if="!suivi" class="alerte alerte--info" role="status">
      <span>{{ t('app.aucun_diagnostic') }}</span>
    </div>

    <template v-else>
      <section class="carte-epreuve">
        <p class="oeil">{{ t('app.epreuve_suivie') }}</p>
        <h2 class="carte-epreuve__nom" dir="auto">{{ suivi.nomEpreuve }}</h2>

        <div class="carte-epreuve__actes">
          <NuxtLink
            v-if="suivi.derniereTentative"
            class="btn"
            :to="localePath(`/app/tentative/${suivi.derniereTentative}`)"
          >
            {{ t('app.reprendre') }}
          </NuxtLink>

          <NuxtLink class="lien-second" :to="localePath(`/app/maitrise/${suivi.codeEpreuve}`)">
            {{ t('app.voir_maitrise') }}
          </NuxtLink>

          <NuxtLink class="lien-second" :to="localePath(`/app/ordonnance/${suivi.codeEpreuve}`)">
            {{ t('app.voir_ordonnance') }}
          </NuxtLink>
        </div>
      </section>

      <section class="mission">
        <h2 class="mission__titre">{{ t('app.mission_titre') }}</h2>

        <p v-if="!mission.length" class="mission__vide">{{ t('app.mission_vide') }}</p>

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
.carte-epreuve {
  margin-block-end: var(--e-6);
  padding: var(--e-5);
  background: var(--surface);
  border: 1px solid var(--bordure);
  border-radius: var(--r);
}

.carte-epreuve__nom {
  margin-block: 0 var(--e-4);
  font-size: var(--t-xl);
  font-weight: 800;
}

.carte-epreuve__actes {
  display: flex;
  flex-wrap: wrap;
  gap: var(--e-4);
  align-items: center;
}

.mission__titre {
  margin-block: 0 var(--e-3);
  font-size: var(--t-lg);
  font-weight: 800;
}

.mission__vide {
  max-inline-size: 60ch;
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

.mission__liste {
  display: grid;
  gap: var(--e-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Trois actions, jamais quatre — propriété du composant, pas de l'appelant.
   Une mission qui en afficherait cinq cesserait d'être une mission. */
.mission__liste > :nth-child(n + 4) {
  display: none;
}

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

.mission__motif {
  font-size: var(--t-sm);
  color: var(--texte-doux);
}

.mission__remede {
  font-size: var(--t-xs);
  color: var(--peda-remede-texte);
}
</style>
