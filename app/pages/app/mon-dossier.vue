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
const { epreuvesOuvertes, niveauxAcademiques } = useCatalogue()
const { data: epreuves, pending: epreuvesChargees, error: epreuvesErreur } = await epreuvesOuvertes()
const { data: niveaux, error: niveauxErreur } = await niveauxAcademiques()

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

/*
 * LYCÉEN OU NON — décidé PENDANT la saisie, pas seulement après.
 *
 * `user.est_lyceen` est la réponse du serveur, et elle ne change qu'une fois
 * le formulaire envoyé. Or c'est au moment où l'élève choisit « tronc commun »
 * qu'il faut cesser de lui réclamer un concours. On lit donc le niveau
 * sélectionné dans la liste servie, et le compte ne sert que de repli.
 */
const estLyceen = computed(() => {
  const choisi = (niveaux.value ?? []).find((n) => n.code === compte.academic_level)

  return choisi ? choisi.lycee : Boolean(user.value?.est_lyceen)
})

/*
 * CE QU'IL RESTE À FAIRE, ÉNUMÉRÉ.
 *
 * L'écran disait « Vos informations ont été mises à jour » puis ne bougeait
 * plus : le dossier restait incomplet, et rien ne disait lequel des six champs
 * manquait. Le candidat concluait que la plateforme était cassée.
 *
 * Cette liste MIROITE la règle du serveur — `User::dossierCandidatComplet()`.
 * Elle guide, elle n'autorise pas : c'est `onboarding_complete`, renvoyé par
 * l'API, qui décide seul de l'ouverture de la navigation. Un désaccord entre
 * les deux ferait au pire une phrase de trop, jamais une porte ouverte à tort.
 */
const restantsDuDossier = computed(() => {
  if (!isCandidate.value) return []

  const manques: string[] = []
  const vide = (valeur: string) => valeur.trim() === ''

  if (vide(compte.first_name)) manques.push(t('champs.prenom'))
  if (vide(compte.last_name)) manques.push(t('champs.nom'))
  if (vide(compte.academic_level)) manques.push(t('champs.niveau_academique'))
  if (vide(compte.address)) manques.push(t('champs.adresse'))
  if (vide(compte.phone)) manques.push(t('dossier.telephone'))
  if (!estLyceen.value && !parcours.exam_code) manques.push(t('dossier.epreuve'))

  return manques
})

/*
 * UN NIVEAU HÉRITÉ DE LA SAISIE LIBRE NE CORRESPOND À AUCUNE OPTION.
 *
 * Les comptes créés avant la liste fermée portent des valeurs comme « tronc
 * commun » ou « TC ». Laissées telles quelles dans le `v-model`, elles ne
 * sélectionnent rien et le champ paraît vide sans que le repère « Choisir
 * votre niveau » s'affiche. On repart donc du placeholder : la personne
 * choisit une fois, et la valeur devient exploitable.
 */
watch(niveaux, (liste) => {
  if (!liste || compte.academic_level === '') return
  if (!liste.some((n) => n.code === compte.academic_level)) compte.academic_level = ''
}, { immediate: true })

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
        academic_level: compte.academic_level,
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
    <GuideEcran cle="dossier" />
    <p class="dossier__intro">{{ t(dossierInitial ? 'dossier.intro_obligatoire' : 'dossier.intro') }}</p>
    <div v-if="dossierInitial" class="alerte" role="status">
      <p>{{ t(estLyceen ? 'dossier.obligatoire_lyceen' : 'dossier.obligatoire') }}</p>
      <!--
        LA LISTE DE CE QUI MANQUE. Sans elle, l'écran répondait « Vos
        informations ont été mises à jour » et ne bougeait plus : le dossier
        restait incomplet sans jamais dire pourquoi.
        `aria-live` parce qu'elle se raccourcit à chaque enregistrement.
      -->
      <template v-if="restantsDuDossier.length">
        <p class="dossier__reste-titre">{{ t('dossier.reste_a_faire') }}</p>
        <ul class="dossier__reste" aria-live="polite">
          <li v-for="manque in restantsDuDossier" :key="manque" dir="auto">{{ manque }}</li>
        </ul>
      </template>
      <p v-else class="dossier__reste-titre">{{ t('dossier.reste_rien') }}</p>
    </div>

    <section class="dossier__bloc">
      <h2>{{ t('dossier.coordonnees') }}</h2>
      <div v-if="erreurCompte" class="alerte alerte--systeme" role="alert" dir="auto">{{ erreurCompte }}</div>
      <div v-if="succesCompte" class="alerte alerte--succes" role="status">{{ t('dossier.compte_succes') }}</div>
      <form class="dossier__formulaire" novalidate @submit.prevent="enregistrerCompte">
        <label class="champ"><span class="champ__label">{{ t('champs.prenom') }}</span><input v-model="compte.first_name" class="champ__saisie" autocomplete="given-name" required :aria-invalid="Boolean(erreursCompte.first_name)"><span v-if="erreursCompte.first_name" class="champ__erreur" dir="auto">{{ erreursCompte.first_name }}</span></label>
        <label class="champ"><span class="champ__label">{{ t('champs.nom') }}</span><input v-model="compte.last_name" class="champ__saisie" autocomplete="family-name" required :aria-invalid="Boolean(erreursCompte.last_name)"><span v-if="erreursCompte.last_name" class="champ__erreur" dir="auto">{{ erreursCompte.last_name }}</span></label>
        <label v-if="isCandidate" class="champ">
          <span class="champ__label">{{ t('champs.niveau_academique') }}</span>
          <select v-model="compte.academic_level" name="academic_level" class="champ__saisie" required :aria-invalid="Boolean(erreursCompte.academic_level)">
            <option value="" disabled>{{ t('dossier.niveau_choisir') }}</option>
            <option v-for="niveau in niveaux ?? []" :key="niveau.code" :value="niveau.code" dir="auto">{{ niveau.name }}</option>
          </select>
          <span v-if="erreursCompte.academic_level" class="champ__erreur" dir="auto">{{ erreursCompte.academic_level }}</span>
          <span v-else-if="niveauxErreur" class="champ__erreur" role="alert">{{ t('dossier.niveaux_indisponibles') }}</span>
          <span v-else class="champ__aide">{{ t('dossier.niveau_aide') }}</span>
        </label>
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
          <select v-model="compte.locale" name="locale" class="champ__saisie">
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
      <h2>{{ estLyceen ? t('dossier.parcours_lyceen') : t('dossier.parcours') }}</h2>
      <!--
        UN LYCÉEN N'A PAS DE CONCOURS À PRÉPARER, et le catalogue ne lui en
        proposait que du CRMEF : pour débloquer son dossier, il devait se
        déclarer candidat à un concours d'enseignement. Le bloc reste ouvert —
        un élève de terminale peut vouloir viser un concours — mais il est
        annoncé pour ce qu'il est : facultatif, et à titre informatif.
      -->
      <p v-if="estLyceen" class="dossier__note" dir="auto">{{ t('dossier.parcours_lyceen_note') }}</p>
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
            <select v-model="parcours.exam_code" name="exam_code" class="champ__saisie" :required="!estLyceen" :disabled="epreuvesChargees || Boolean(epreuvesErreur)" :aria-invalid="Boolean(erreursParcours.exam_code)">
              <option value="" :disabled="!estLyceen">{{ estLyceen ? t('dossier.epreuve_aucune') : t('dossier.epreuve_choisir') }}</option>
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
            <!-- Un repère là où le mot ne dit pas ce qu'il fait : « objectif »
                 pourrait passer pour un champ décoratif. -->
            <AideBulle :sujet="t('dossier.objectif')" :texte="t('aide.objectif')" />
            <textarea v-model="parcours.objective" class="champ__saisie" rows="3" dir="auto" :aria-invalid="Boolean(erreursParcours.objective)" />
            <span v-if="erreursParcours.objective" class="champ__erreur" dir="auto">{{ erreursParcours.objective }}</span>
          </label>
          <label class="champ">
            <span class="champ__label">{{ t('dossier.date_cible') }}</span>
            <!-- Celui-ci compte plus qu'il n'en a l'air : la date cible arrête
                 la planification des révisions deux jours avant l'épreuve. -->
            <AideBulle :sujet="t('dossier.date_cible')" :texte="t('aide.date_cible')" />
            <input v-model="parcours.target_date" class="champ__saisie" type="date" :aria-invalid="Boolean(erreursParcours.target_date)">
            <span v-if="erreursParcours.target_date" class="champ__erreur" dir="auto">{{ erreursParcours.target_date }}</span>
          </label>
          <!--
            `PUT me/profile` EXIGE une épreuve : la laisser vide vaudrait un 422,
            c'est-à-dire le cul-de-sac qu'on vient de retirer au lycéen. Tant
            qu'il n'a rien choisi, il n'y a simplement rien à enregistrer ici.
          -->
          <button class="btn" type="submit" :disabled="envoiParcours || !parcours.exam_code">{{ envoiParcours ? t('dossier.parcours_envoi') : t('dossier.parcours_enregistrer') }}</button>
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
/* Ce qu'il reste à faire — logique, jamais physique : la liste se retourne en RTL. */
.dossier__reste-titre { margin-block: var(--e-3) var(--e-2); font-weight: 600; }
.dossier__reste { margin: 0; padding-inline-start: var(--e-5); display: grid; gap: var(--e-1); }
.dossier__note { color: var(--texte-doux); max-inline-size: 65ch; }
</style>
