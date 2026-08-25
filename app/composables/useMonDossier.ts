import type { CategorieDePublic } from '~/utils/publicVise'

export interface ProfilPrepare {
  exam_code?: string | null
  objective?: string | null
  target_date?: string | null
  updated_at?: string | null
  /**
   * SA CATÉGORIE DE PUBLIC — ABSENTE quand il n'y a rien à déduire.
   *
   * Seul champ de cette ressource qui disparaît au lieu de valoir `null`, et
   * l'écart est celui du serveur, pas une commodité d'ici. Les trois autres
   * décrivent une DÉCLARATION, et « je n'ai pas encore choisi d'épreuve » est
   * une information que `null` dit bien. La catégorie, elle, se DÉDUIT —
   * épreuve → parcours → famille → catégorie : sans épreuve, il n'y a rien à
   * déduire, et le champ n'existe pas.
   *
   * La typer `| null` inviterait à traiter « inconnu » comme une catégorie.
   * L'absence oblige à se poser la question, et `conditionDePublic()` y répond.
   */
  audience?: CategorieDePublic
}

export interface ProfilPreparePayload {
  exam_code: string
  objective: string | null
  target_date: string | null
}

export function normaliserProfilPrepare(payload: {
  exam_code: string
  objective: string
  target_date: string
}): ProfilPreparePayload {
  return {
    exam_code: payload.exam_code.trim(),
    objective: payload.objective.trim() || null,
    target_date: payload.target_date || null,
  }
}

export interface ActeJuridique {
  action: string
  document_kind: string
  document_version: string
  document_locale: string
  occurred_at: string
}

export function useMonDossier() {
  const api = useApi()

  const profil = () => useAsyncData('mon-dossier:profil', () =>
    api.get<{ data: ProfilPrepare | null }>('/me/profile'), { transform: response => response.data })

  const actes = () => useAsyncData('mon-dossier:actes', () =>
    api.get<{ data: ActeJuridique[] }>('/me/legal'), { transform: response => response.data })

  const modifierCompte = (payload: {
    first_name: string
    last_name: string
    academic_level?: string
    address?: string
    email: string
    phone: string | null
    locale: 'fr' | 'ar'
    current_password: string | null
  }) =>
    api.patch('/me/account', payload)

  const modifierProfil = (payload: ProfilPreparePayload) =>
    api.put<{ data: ProfilPrepare }>('/me/profile', payload)

  const modifierMotDePasse = (payload: {
    current_password: string
    password: string
    password_confirmation: string
  }) => api.put('/me/password', payload)

  const accepterInvitation = (payload: { token: string; password: string; password_confirmation: string }) =>
    api.post('/auth/staff-invitations/accept', payload)

  return { profil, actes, modifierCompte, modifierProfil, modifierMotDePasse, accepterInvitation }
}
