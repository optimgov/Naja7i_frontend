<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'
import { normaliserProfilPrepare } from '~/composables/useMonDossier'

definePageMeta({ layout: 'app', middleware: 'auth' })

const { t, locale, setLocale } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const { user, refresh, isCandidate } = useAuth()
const suite = computed(() => suiteInterne(route.query.suite))
const dossierInitial = computed(() => isCandidate.value && !user.value?.onboarding_complete)
const { profil, actes, modifierCompte, modifierProfil, modifierMotDePasse } = useMonDossier()
const { data: profilPrepare, pending: profilCharge, error: profilErreur } = await profil()
const { data: actesJuridiques, pending: actesCharges, error: actesErreur } = await actes()
const { epreuvesOuvertes } = useCatalogue()
const { data: epreuves, pending: epreuvesChargees, error: epreuvesErreur } = await epreuvesOuvertes()

const compte = reactive({
  first_name: user.value?.first_name ?? '',
  last_name: user.value?.last_name ?? '',
  academic_level: user.value?.academic_level ?? '',
  address: user.value?.address ?? '',
  email: user.value?.email ?? '',
  phone: user.value?.phone ?? '',
  locale: user.value?.locale ?? 'fr' as 'fr' | 'ar',
  current_password: '',
})
const motDePasse = reactive({ current_password: '', password: '', password_confirmation: '' })
const parcours = reactive({
  exam_code: profilPrepare.value?.exam_code ?? '',
  objective: profilPrepare.value?.objective ?? '',
  target_date: profilPrepare.value?.target_date ?? '',
})
const erreursCompte = ref<Record<string, string>>({})
const erreursParcours = ref<Record<string, string>>({})
const erreursMotDePasse = ref<Record<string, string>>({})
const erreurCompte = ref('')
const erreurParcours = ref('')
const erreurMotDePasse = ref('')
const succesCompte = ref(false)
const succesParcours = ref(false)
const succesMotDePasse = ref(false)
const envoiCompte = ref(false)
const envoiParcours = ref(false)
const envoiMotDePasse = ref(false)

const epreuve = computed(() => profilPrepare.value?.exam_code ?? null)
const emailModifie = computed(() => compte.email.trim() !== (user.value?.email ?? ''))

async function poursuivreSiComplet(): Promise<void> {
  await refresh()
  if (user.value?.onboarding_complete) {
    await navigateTo(suite.value ?? localePath('/app'))
  }
}

function libelleActe(acte: { document_kind: string }): string {
  const connus: Record<string, string> = {
    terms: t('dossier.acte_terms'),
    privacy: t('dossier.acte_privacy'),
    marketing: t('dossier.acte_marketing'),
  }
  return connus[acte.document_kind] ?? t('dossier.acte_generique')
}

async function enregistrerCompte(): Promise<void> {
  envoiCompte.value = true
  erreursCompte.value = {}
  erreurCompte.value = ''
  succesCompte.value = false
  const langueAvant = locale.value
  try {
    await modifierCompte({
      first_name: compte.first_name.trim(),
      last_name: compte.last_name.trim(),
      ...(isCandidate.value ? {
        academic_level: compte.academic_level.trim(),
        address: compte.address.trim(),
      } : {}),
      email: compte.email.trim(),
      phone: compte.phone.trim(),
      locale: compte.locale,
      current_password: compte.current_password || null,
    })
    await poursuivreSiComplet()
    compte.current_password = ''
    succesCompte.value = true
    if (langueAvant !== compte.locale) await setLocale(compte.locale)
  } catch (error: unknown) {
    if (error instanceof ApiRequestError) {
      erreursCompte.value = error.fieldErrors
      if (!Object.keys(erreursCompte.value).length) erreurCompte.value = error.message
    }
  } finally { envoiCompte.value = false }
}

async function enregistrerParcours(): Promise<void> {
  envoiParcours.value = true
  erreursParcours.value = {}
  erreurParcours.value = ''
  succesParcours.value = false

  try {
    const response = await modifierProfil(normaliserProfilPrepare(parcours))
    profilPrepare.value = response.data
    parcours.exam_code = response.data.exam_code ?? ''
    parcours.objective = response.data.objective ?? ''
    parcours.target_date = response.data.target_date ?? ''
    succesParcours.value = true
    await poursuivreSiComplet()
  } catch (error: unknown) {
    if (error instanceof ApiRequestError) {
      erreursParcours.value = error.fieldErrors
      if (!Object.keys(erreursParcours.value).length) erreurParcours.value = error.message
    }
  } finally {
    envoiParcours.value = false
  }
}

async function enregistrerMotDePasse(): Promise<void> {
  envoiMotDePasse.value = true
  erreursMotDePasse.value = {}
  erreurMotDePasse.value = ''
  succesMotDePasse.value = false
  try {
    await modifierMotDePasse(motDePasse)
    motDePasse.current_password = ''
    motDePasse.password = ''
    motDePasse.password_confirmation = ''
    succesMotDePasse.value = true
  } catch (error: unknown) {
    if (error instanceof ApiRequestError) {
      erreursMotDePasse.value = error.fieldErrors
      if (!Object.keys(erreursMotDePasse.value).length) erreurMotDePasse.value = error.message
    }
  } finally { envoiMotDePasse.value = false }
}

useHead({ title: () => t('dossier.titre') })
</script>

<template>
  <div class="enveloppe dossier">
    <p class="oeil">{{ t('dossier.oeil') }}</p>
    <h1 class="titre-page">{{ t('dossier.titre') }}</h1>
    <p class="dossier__intro">{{ t(dossierInitial ? 'dossier.intro_obligatoire' : 'dossier.intro') }}</p>
    <div v-if="dossierInitial" class="alerte" role="status">
      {{ t('dossier.obligatoire') }}
    </div>

    <section class="dossier__bloc">
      <h2>{{ t('dossier.coordonnees') }}</h2>
      <div v-if="erreurCompte" class="alerte alerte--systeme" role="alert" dir="auto">{{ erreurCompte }}</div>
      <div v-if="succesCompte" class="alerte alerte--succes" role="status">{{ t('dossier.compte_succes') }}</div>
      <form class="dossier__formulaire" novalidate @submit.prevent="enregistrerCompte">
        <label class="champ"><span class="champ__label">{{ t('champs.prenom') }}</span><input v-model="compte.first_name" class="champ__saisie" autocomplete="given-name" required :aria-invalid="Boolean(erreursCompte.first_name)"><span v-if="erreursCompte.first_name" class="champ__erreur" dir="auto">{{ erreursCompte.first_name }}</span></label>
        <label class="champ"><span class="champ__label">{{ t('champs.nom') }}</span><input v-model="compte.last_name" class="champ__saisie" autocomplete="family-name" required :aria-invalid="Boolean(erreursCompte.last_name)"><span v-if="erreursCompte.last_name" class="champ__erreur" dir="auto">{{ erreursCompte.last_name }}</span></label>
        <label v-if="isCandidate" class="champ"><span class="champ__label">{{ t('champs.niveau_academique') }}</span><input v-model="compte.academic_level" name="academic_level" class="champ__saisie" required :aria-invalid="Boolean(erreursCompte.academic_level)"><span v-if="erreursCompte.academic_level" class="champ__erreur" dir="auto">{{ erreursCompte.academic_level }}</span></label>
        <label v-if="isCandidate" class="champ"><span class="champ__label">{{ t('champs.adresse') }}</span><textarea v-model="compte.address" class="champ__saisie" autocomplete="street-address" rows="2" required dir="auto" :aria-invalid="Boolean(erreursCompte.address)" /><span v-if="erreursCompte.address" class="champ__erreur" dir="auto">{{ erreursCompte.address }}</span></label>
        <label class="champ">
          <span class="champ__label">{{ t('champs.email') }}</span>
          <input v-model="compte.email" class="champ__saisie" type="email" autocomplete="email" required :aria-invalid="Boolean(erreursCompte.email)">
          <span v-if="erreursCompte.email" class="champ__erreur" dir="auto">{{ erreursCompte.email }}</span>
          <span v-else class="champ__aide">{{ user?.email_verified ? t('dossier.verifie') : t('dossier.non_verifie') }}</span>
        </label>
        <label class="champ">
          <span class="champ__label">{{ t('dossier.telephone') }}</span>
          <input v-model="compte.phone" class="champ__saisie" type="tel" autocomplete="tel" inputmode="tel" required placeholder="06 12 34 56 78" :aria-invalid="Boolean(erreursCompte.phone)">
          <span v-if="erreursCompte.phone" class="champ__erreur" dir="auto">{{ erreursCompte.phone }}</span>
          <span v-else-if="user?.phone" class="champ__aide">{{ user.phone_verified ? t('dossier.verifie') : t('dossier.non_verifie') }}</span>
          <span v-else class="champ__aide">{{ t('dossier.telephone_marocain') }}</span>
        </label>
        <label class="champ">
          <span class="champ__label">{{ t('dossier.langue') }}</span>
          <select v-model="compte.locale" class="champ__saisie">
            <option value="fr">Français</option><option value="ar">العربية</option>
          </select>
        </label>
        <label class="champ">
          <span class="champ__label">{{ t('dossier.compte_mot_de_passe') }}</span>
          <input v-model="compte.current_password" class="champ__saisie" type="password" autocomplete="current-password" :required="emailModifie" :aria-required="emailModifie" :aria-invalid="Boolean(erreursCompte.current_password)">
          <span v-if="erreursCompte.current_password" class="champ__erreur" dir="auto">{{ erreursCompte.current_password }}</span>
          <span v-else class="champ__aide">{{ t('dossier.compte_mot_de_passe_aide') }}</span>
        </label>
        <button class="btn" type="submit" :disabled="envoiCompte">{{ envoiCompte ? t('dossier.envoi') : t('dossier.enregistrer') }}</button>
      </form>
    </section>

    <section class="dossier__bloc">
      <h2>{{ t('dossier.parcours') }}</h2>
      <p v-if="profilCharge">{{ t('dossier.chargement') }}</p>
      <div v-else-if="profilErreur" class="alerte alerte--systeme" role="alert">{{ t('dossier.profil_indisponible') }}</div>
      <template v-else>
        <p v-if="epreuve" dir="auto">{{ t('dossier.epreuve_preparee') }} <strong>{{ epreuve }}</strong></p>
        <p v-else>{{ t('dossier.profil_vide') }}</p>
        <div v-if="erreurParcours" class="alerte alerte--systeme" role="alert" dir="auto">{{ erreurParcours }}</div>
        <div v-if="succesParcours" class="alerte alerte--succes" role="status">{{ t('dossier.parcours_succes') }}</div>
        <form class="dossier__formulaire" novalidate @submit.prevent="enregistrerParcours">
          <label class="champ">
            <span class="champ__label">{{ t('dossier.epreuve') }}</span>
            <select v-model="parcours.exam_code" class="champ__saisie" required :disabled="epreuvesChargees || Boolean(epreuvesErreur)" :aria-invalid="Boolean(erreursParcours.exam_code)">
              <option value="" disabled>{{ t('dossier.epreuve_choisir') }}</option>
              <option v-for="option in epreuves ?? []" :key="option.code" :value="option.code" dir="auto">
                {{ option.name }} — {{ option.famille.name }}
              </option>
            </select>
            <span v-if="erreursParcours.exam_code" class="champ__erreur" dir="auto">{{ erreursParcours.exam_code }}</span>
            <span v-else-if="epreuvesChargees" class="champ__aide">{{ t('dossier.epreuves_chargement') }}</span>
            <span v-else-if="epreuvesErreur" class="champ__erreur" role="alert">{{ t('dossier.epreuves_indisponibles') }}</span>
            <span v-else class="champ__aide">{{ t('dossier.epreuve_aide') }}</span>
          </label>
          <label class="champ">
            <span class="champ__label">{{ t('dossier.objectif') }}</span>
            <textarea v-model="parcours.objective" class="champ__saisie" rows="3" dir="auto" :aria-invalid="Boolean(erreursParcours.objective)" />
            <span v-if="erreursParcours.objective" class="champ__erreur" dir="auto">{{ erreursParcours.objective }}</span>
          </label>
          <label class="champ">
            <span class="champ__label">{{ t('dossier.date_cible') }}</span>
            <input v-model="parcours.target_date" class="champ__saisie" type="date" :aria-invalid="Boolean(erreursParcours.target_date)">
            <span v-if="erreursParcours.target_date" class="champ__erreur" dir="auto">{{ erreursParcours.target_date }}</span>
          </label>
          <button class="btn" type="submit" :disabled="envoiParcours">{{ envoiParcours ? t('dossier.parcours_envoi') : t('dossier.parcours_enregistrer') }}</button>
        </form>
        <NuxtLink class="lien-second dossier__porte" :to="{ path: localePath('/se-preparer'), query: { espace: 'candidat' } }">{{ t('dossier.voir_preparations') }}</NuxtLink>
      </template>
    </section>

    <section class="dossier__bloc">
      <h2>{{ t('dossier.securite') }}</h2>
      <div v-if="erreurMotDePasse" class="alerte alerte--systeme" role="alert" dir="auto">{{ erreurMotDePasse }}</div>
      <div v-if="succesMotDePasse" class="alerte alerte--succes" role="status">{{ t('dossier.mot_de_passe_succes') }}</div>
      <form class="dossier__formulaire" novalidate @submit.prevent="enregistrerMotDePasse">
        <label class="champ"><span class="champ__label">{{ t('dossier.mot_de_passe_actuel') }}</span><input v-model="motDePasse.current_password" class="champ__saisie" type="password" autocomplete="current-password" required><span v-if="erreursMotDePasse.current_password" class="champ__erreur" dir="auto">{{ erreursMotDePasse.current_password }}</span></label>
        <label class="champ"><span class="champ__label">{{ t('dossier.nouveau_mot_de_passe') }}</span><input v-model="motDePasse.password" class="champ__saisie" type="password" autocomplete="new-password" required><span v-if="erreursMotDePasse.password" class="champ__erreur" dir="auto">{{ erreursMotDePasse.password }}</span></label>
        <label class="champ"><span class="champ__label">{{ t('champs.confirmation') }}</span><input v-model="motDePasse.password_confirmation" class="champ__saisie" type="password" autocomplete="new-password" required></label>
        <button class="btn" type="submit" :disabled="envoiMotDePasse">{{ envoiMotDePasse ? t('dossier.envoi') : t('dossier.changer_mot_de_passe') }}</button>
      </form>
    </section>

    <section class="dossier__bloc">
      <h2>{{ t('dossier.juridique') }}</h2>
      <p v-if="actesCharges">{{ t('dossier.chargement') }}</p>
      <div v-else-if="actesErreur" class="alerte alerte--systeme" role="alert">{{ t('dossier.actes_indisponibles') }}</div>
      <ul v-else-if="actesJuridiques?.length" class="dossier__actes">
        <li v-for="acte in actesJuridiques" :key="`${acte.action}-${acte.document_kind}-${acte.document_version}-${acte.occurred_at}`">
          <span dir="auto">{{ libelleActe(acte) }}</span>
          <span>{{ t('dossier.enregistre') }}</span>
        </li>
      </ul>
      <p v-else>{{ t('dossier.aucun_acte') }}</p>
      <div class="dossier__liens"><NuxtLink :to="localePath('/conditions')">{{ t('conditions.titre') }}</NuxtLink><NuxtLink :to="localePath('/confidentialite')">{{ t('confidentialite.titre') }}</NuxtLink></div>
    </section>
  </div>
</template>

<style scoped>
.dossier { max-inline-size: 58rem; padding-block-end: var(--e-7); }
.dossier__intro { color: var(--texte-doux); max-inline-size: 65ch; }
.dossier__bloc { margin-block-start: var(--e-5); padding: var(--e-5); border: 1px solid var(--bordure); border-radius: var(--r-m); background: var(--surface); }
.dossier__bloc h2 { margin-block-start: 0; font-size: var(--t-lg); }
.dossier__formulaire { display: grid; gap: var(--e-4); max-inline-size: 36rem; }
.dossier__actes { display: grid; gap: var(--e-2); padding: 0; list-style: none; }
.dossier__actes li { display: flex; justify-content: space-between; gap: var(--e-3); padding-block: var(--e-2); border-block-end: 1px solid var(--bordure); }
.dossier__liens { display: flex; flex-wrap: wrap; gap: var(--e-4); }
.dossier__porte { display: inline-block; margin-block-start: var(--e-4); }
</style>
