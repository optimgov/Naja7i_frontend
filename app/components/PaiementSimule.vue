<script setup lang="ts">
import type { Plan } from '~/composables/useAbonnement'
import { ApiRequestError } from '~/composables/useApi'

/**
 * Le paiement simulé — UN COMPOSANT À PART, ET C'EST LA RAISON D'ÊTRE DU FICHIER.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI IL N'EST PAS UN BLOC DE `abonnement.vue`
 *
 * Ma première écriture posait un `v-if="PAIEMENT_SIMULE_DISPONIBLE"` dans la
 * page, en affirmant en commentaire que le code disparaissait du bundle de
 * production. **C'était faux, et vérifié faux** : `grep` retrouvait
 * `orders/simulated` et le libellé du bloc dans `.output/`. Un `v-if` sur une
 * constante reste un contrôle d'EXÉCUTION — la fonction de rendu contient
 * toujours la branche, et l'appel réseau vit dans le composable partagé.
 *
 * Ici, l'appel réseau ET l'interface vivent dans CE fichier, chargé par un
 * `import()` dynamique que la page place derrière `import.meta.dev`. Vite
 * remplace cette expression par `false` à la compilation ; la branche devient
 * inatteignable et Rollup n'émet pas le morceau. Le code n'est alors pas
 * « désactivé » : il n'est pas là.
 *
 * La vérification est dans la recette, pas dans ce commentaire : elle greppe le
 * bundle de production. C'est la leçon de la première tentative — une garantie
 * de compilation qu'on n'a pas mesurée est une supposition.
 *
 * TROISIÈME SERRURE. La route n'est pas déclarée en production côté serveur, et
 * `SimulatedGateway` refuse de s'instancier là-bas. Chacune protège une porte
 * différente, et aucune ne dépend des deux autres.
 */
const props = defineProps<{ offres: Plan[], planChoisi: string }>()

const emit = defineEmits<{ paye: [] }>()

const { t } = useI18n()
const api = useApi()

const envoi = ref(false)
const erreur = ref<string | null>(null)

async function payer(planCode: string): Promise<void> {
  if (envoi.value) return
  envoi.value = true
  erreur.value = null

  try {
    await api.post(
      '/me/orders/simulated',
      { plan_code: planCode },
      { 'Idempotency-Key': crypto.randomUUID() },
    )
    emit('paye')
  }
  catch (e: unknown) {
    if (e instanceof ApiRequestError) erreur.value = e.message
    else throw e
  }
  finally {
    envoi.value = false
  }
}
</script>

<template>
  <section class="bloc bloc--simulation">
    <h2>{{ t('abonnement.simulation_titre') }}</h2>
    <p class="bloc__texte">{{ t('abonnement.simulation_texte') }}</p>

    <div class="simulation__offres">
      <button
        v-for="plan in props.offres"
        :key="plan.code"
        type="button"
        class="btn btn--fantome"
        :class="{ 'btn--choisi': plan.code === props.planChoisi }"
        :disabled="envoi"
        @click="payer(plan.code)"
      >
        {{ t('abonnement.simulation_payer', { plan: plan.name }) }}
      </button>
    </div>

    <p v-if="erreur" class="champ__erreur" role="alert" dir="auto">{{ erreur }}</p>
  </section>
</template>

<style scoped>
/* Marqué sans ambiguïté : personne ne doit croire qu'il vient de payer. */
.bloc {
  margin-block-end: var(--e-5);
  padding-block-start: var(--e-4);
  border-block-start: 1px dashed var(--bordure-forte);
}

.bloc h2 { font-size: var(--t-lg); }
.bloc__texte { font-size: var(--t-sm); color: var(--texte-doux); max-inline-size: 62ch; }
.simulation__offres { display: flex; flex-wrap: wrap; gap: var(--e-2); }
.btn--choisi { border-color: var(--accent); }
</style>
