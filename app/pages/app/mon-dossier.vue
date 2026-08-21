<script setup lang="ts">
import { ApiRequestError } from '~/composables/useApi'

definePageMeta({ layout: 'app', middleware: 'auth' })

const { t, locale, setLocale } = useI18n()
const localePath = useLocalePath()
const { user, refresh } = useAuth()
const { profil, actes, modifierCompte, modifierMotDePasse } = useMonDossier()
const { data: profilPrepare, pending: profilCharge, error: profilErreur } = await profil()
const { data: actesJuridiques, pending: actesCharges, error: actesErreur } = await actes()

const compte = reactive({ email: user.value?.email ?? '', phone: user.value?.phone ?? '', locale: user.value?.locale ?? 'fr' as 'fr' | 'ar' })
const motDePasse = reactive({ current_password: '', password: '', password_confirmation: '' })
const erreursCompte = ref<Record<string, string>>({})
const erreursMotDePasse = ref<Record<string, string>>({})
const erreurCompte = ref('')
const erreurMotDePasse = ref('')
const succesCompte = ref(false)
const succesMotDePasse = ref(false)
const envoiCompte = ref(false)
const envoiMotDePasse = ref(false)

const epreuve = computed(() => profilPrepare.value?.exam_code ?? null)

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
    await modifierCompte({ email: compte.email.trim(), phone: compte.phone.trim() || null, locale: compte.locale })
    await refresh()
    succesCompte.value = true
    if (langueAvant !== compte.locale) await setLocale(compte.locale)
  } catch (error: unknown) {
    if (error instanceof ApiRequestError) {
      erreursCompte.value = error.fieldErrors
      if (!Object.keys(erreursCompte.value).length) erreurCompte.value = error.message
    }
  } finally { envoiCompte.value = false }
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
    <p class="dossier__intro">{{ t('dossier.intro') }}</p>

    <section class="dossier__bloc">
      <h2>{{ t('dossier.coordonnees') }}</h2>
      <div v-if="erreurCompte" class="alerte alerte--systeme" role="alert" dir="auto">{{ erreurCompte }}</div>
      <div v-if="succesCompte" class="alerte alerte--succes" role="status">{{ t('dossier.compte_succes') }}</div>
      <form class="dossier__formulaire" novalidate @submit.prevent="enregistrerCompte">
        <label class="champ">
          <span class="champ__label">{{ t('champs.email') }}</span>
          <input v-model="compte.email" class="champ__saisie" type="email" autocomplete="email" required :aria-invalid="Boolean(erreursCompte.email)">
          <span v-if="erreursCompte.email" class="champ__erreur" dir="auto">{{ erreursCompte.email }}</span>
          <span v-else class="champ__aide">{{ user?.email_verified ? t('dossier.verifie') : t('dossier.non_verifie') }}</span>
        </label>
        <label class="champ">
          <span class="champ__label">{{ t('dossier.telephone') }}</span>
          <input v-model="compte.phone" class="champ__saisie" type="tel" autocomplete="tel" :aria-invalid="Boolean(erreursCompte.phone)">
          <span v-if="erreursCompte.phone" class="champ__erreur" dir="auto">{{ erreursCompte.phone }}</span>
          <span v-else-if="user?.phone" class="champ__aide">{{ user.phone_verified ? t('dossier.verifie') : t('dossier.non_verifie') }}</span>
        </label>
        <label class="champ">
          <span class="champ__label">{{ t('dossier.langue') }}</span>
          <select v-model="compte.locale" class="champ__saisie">
            <option value="fr">Français</option><option value="ar">العربية</option>
          </select>
        </label>
        <button class="btn" type="submit" :disabled="envoiCompte">{{ envoiCompte ? t('dossier.envoi') : t('dossier.enregistrer') }}</button>
      </form>
    </section>

    <section class="dossier__bloc">
      <h2>{{ t('dossier.parcours') }}</h2>
      <p v-if="profilCharge">{{ t('dossier.chargement') }}</p>
      <div v-else-if="profilErreur" class="alerte alerte--systeme" role="alert">{{ t('dossier.profil_indisponible') }}</div>
      <p v-else-if="epreuve" dir="auto">{{ t('dossier.epreuve_preparee') }} <strong>{{ epreuve }}</strong></p>
      <p v-else>{{ t('dossier.profil_vide') }}</p>
      <NuxtLink class="lien-second" :to="localePath('/se-preparer')">{{ t('dossier.gerer_parcours') }}</NuxtLink>
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
</style>
