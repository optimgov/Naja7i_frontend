export interface ProfilPrepare {
  exam_code?: string | null
  objective?: string | null
  target_date?: string | null
  updated_at?: string | null
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

  const modifierCompte = (payload: { email: string; phone: string | null; locale: 'fr' | 'ar' }) =>
    api.patch('/me/account', payload)

  const modifierMotDePasse = (payload: {
    current_password: string
    password: string
    password_confirmation: string
  }) => api.put('/me/password', payload)

  const accepterInvitation = (payload: { token: string; password: string; password_confirmation: string }) =>
    api.post('/auth/staff-invitations/accept', payload)

  return { profil, actes, modifierCompte, modifierMotDePasse, accepterInvitation }
}
