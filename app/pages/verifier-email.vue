<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

definePageMeta({ layout: 'auth' })

const { t } = useI18n()
const route = useRoute()
const localePath = useLocalePath()
const { user, verifyEmail, resendVerification, fetchMe } = useAuth()

type Etat = 'verification' | 'reussi' | 'echec' | 'attente'

const etat = ref<Etat>('attente')
const message = ref('')
const renvoiFait = ref(false)
const renvoiEnCours = ref(false)

/*
 * ─────────────────────── LA SUITE TRAVERSE LA BOÎTE AUX LETTRES ─────────────
 *
 * C'EST ICI QUE LA CHAÎNE CASSAIT, ET IL FALLAIT UN RELAIS.
 *
 * `?suite=` voyage très bien de `/se-preparer` à la connexion, de la connexion
 * à l'inscription, et de l'inscription jusqu'ici : ce sont des navigations du
 * même onglet. Mais le lien de vérification est fabriqué par le BACKEND et
 * n'emporte que son jeton — il revient donc SANS destination. Un visiteur neuf
 * qui voulait un diagnostic d'informatique atterrissait sur un tableau de bord
 * vide, après avoir traversé quatre écrans pour y arriver.
 *
 * Le relais est un cookie court, et il ne peut rien affirmer d'autre que ce que
 * le visiteur a lui-même demandé :
 *
 *   - il ne porte QUE ce que `suiteInterne` accepte, à l'écriture comme à la
 *     lecture — le contrôle contre la redirection ouverte s'applique deux fois ;
 *   - il vit trente minutes, la durée d'une vérification d'e-mail, pas celle
 *     d'une session ;
 *   - il est effacé dès qu'il a servi, pour ne pas dérouter une visite
 *     ultérieure qui n'aurait rien demandé.
 *
 * Le chemin ALTERNATIF reste entier : lien ouvert dans un autre navigateur, ou
 * cookie expiré, et l'on retombe sur `/app`. C'est un repli de NAVIGATION, pas
 * un repli sur une donnée inventée.
 */
const memoire = useCookie<string | null>('naja7i_suite', {
  maxAge: 60 * 30,
  sameSite: 'lax',
  path: '/',
  default: () => null,
})

const depuisRoute = suiteInterne(route.query.suite)
if (depuisRoute) memoire.value = depuisRoute

const suite = computed(() => depuisRoute ?? suiteInterne(memoire.value))
const destination = computed(() => suite.value ?? localePath('/app'))

/** Le relais a servi : on le retire. Il n'a pas à survivre à son usage. */
function oublierSuite(): void {
  memoire.value = null
}

// Le jeton arrive dans l'URL du lien reçu par e-mail. Il est consommé
// immédiatement, puis retiré de l'URL : un jeton ne doit pas rester dans
// l'historique du navigateur ni dans un référent transmis à un tiers.
onMounted(async () => {
  const token = route.query.token as string | undefined

  if (!token) {
    await fetchMe()
    etat.value = user.value?.email_verified ? 'reussi' : 'attente'
    return
  }

  etat.value = 'verification'

  try {
    await verifyEmail(token)
    etat.value = 'reussi'

    /* On retire le JETON, pas la destination : c'est le jeton qui ne doit pas
       traîner dans l'historique. Effacer la requête entière ferait perdre la
       suite au premier rechargement, juste avant qu'elle serve. */
    const requete = suite.value ? `?suite=${encodeURIComponent(suite.value)}` : ''
    window.history.replaceState({}, '', window.location.pathname + requete)
  } catch (e) {
    etat.value = 'echec'
    message.value = e instanceof ApiRequestError ? e.error.message : t('errors.network')
  }
})

async function renvoyer() {
  if (!user.value?.email) return
  renvoiEnCours.value = true

  try {
    await resendVerification(user.value.email)
    renvoiFait.value = true
  } finally {
    renvoiEnCours.value = false
  }
}

useHead({ title: t('verification.titre') })
</script>

<template>
  <div>
    <h1 class="titre-page">{{ t('verification.titre') }}</h1>

    <p v-if="etat === 'verification'" class="sous-titre">{{ t('verification.en_cours') }}</p>

    <template v-else-if="etat === 'reussi'">
      <div class="alerte alerte--succes" role="status">{{ t('verification.reussi') }}</div>

      <!-- Le candidat repart OÙ IL ALLAIT, pas sur un tableau de bord générique.
           `oublierSuite` retire le relais au moment où il sert. -->
      <NuxtLink :to="destination" class="btn" @click="oublierSuite">
        {{ suite ? t('verification.continuer_suite') : t('verification.continuer') }}
      </NuxtLink>
    </template>

    <template v-else-if="etat === 'echec'">
      <div class="alerte alerte--systeme" role="alert">{{ message }}</div>
      <p class="sous-titre">{{ t('verification.echec_aide') }}</p>
      <button class="btn btn--bloc" :disabled="renvoiEnCours || renvoiFait" @click="renvoyer">
        {{ renvoiFait ? t('verification.renvoye') : t('verification.renvoyer') }}
      </button>
    </template>

    <template v-else>
      <p class="sous-titre">
        {{ t('verification.attente', { email: user?.email ?? '' }) }}
      </p>
      <div v-if="renvoiFait" class="alerte alerte--succes" role="status">
        {{ t('verification.renvoye_detail') }}
      </div>
      <button class="btn btn--bloc" :disabled="renvoiEnCours || renvoiFait" @click="renvoyer">
        {{ renvoiFait ? t('verification.renvoye') : t('verification.renvoyer') }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.sous-titre { margin-block-end: var(--e-5); color: var(--texte-doux); font-size: var(--t-s); }
.bouton--lien { display: block; text-align: center; text-decoration: none; }
</style>
