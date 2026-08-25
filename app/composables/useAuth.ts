export interface CandidateUser {
  uuid: string
  first_name: string | null
  last_name: string | null
  academic_level: string | null
  address: string | null
  email: string
  phone: string | null
  locale: 'fr' | 'ar'
  status: string
  email_verified: boolean
  phone_verified?: boolean
  roles?: string[]
  role_labels?: string[]
}

interface MeResponse {
  data: CandidateUser
  meta: {
    email_verified: boolean
    pending_legal_actions: string[]
  }
}

/**
 * État d'authentification partagé. `useState` le rend compatible SSR : l'état
 * calculé côté serveur est transmis au navigateur sans second appel.
 */
export function useAuth() {
  const user = useState<CandidateUser | null>('auth.user', () => null)
  const pendingLegal = useState<string[]>('auth.pendingLegal', () => [])
  const api = useApi()

  const isAuthenticated = computed(() => user.value !== null)
  const needsVerification = computed(() => user.value !== null && !user.value.email_verified)
  const isStaff = computed(() => user.value?.roles?.some(role => role !== 'candidat') ?? false)
  const isCandidate = computed(() => user.value?.roles?.includes('candidat') ?? false)

  async function fetchMe(): Promise<void> {
    try {
      const response = await api.get<MeResponse>('/me')
      user.value = response.data
      pendingLegal.value = response.meta?.pending_legal_actions ?? []
    } catch {
      user.value = null
      pendingLegal.value = []
    }
  }

  async function register(payload: {
    first_name: string
    last_name: string
    academic_level: string
    address: string
    email: string
    password: string
    password_confirmation: string
    locale: 'fr' | 'ar'
    terms_accepted: boolean
    privacy_notice_acknowledged: boolean
    marketing_granted: boolean
  }): Promise<void> {
    const response = await api.post<{ data: CandidateUser }>('/auth/register', payload)
    user.value = response.data
  }

  async function login(email: string, password: string, remember = false): Promise<void> {
    const response = await api.post<{ data: CandidateUser }>('/auth/login', {
      email,
      password,
      remember,
    })
    user.value = response.data
  }

  async function logout(): Promise<void> {
    await api.post('/auth/logout')
    user.value = null
    pendingLegal.value = []
    await navigateTo(useLocalePath()('/connexion'))
  }

  async function verifyEmail(token: string): Promise<void> {
    const response = await api.post<{ data: CandidateUser }>('/auth/email/verify', { token })
    user.value = response.data
  }

  async function resendVerification(email: string): Promise<void> {
    await api.post('/auth/email/resend', { email })
  }

  async function requestPasswordReset(email: string): Promise<void> {
    await api.post('/auth/password/request', { email })
  }

  async function resetPassword(payload: {
    token: string
    email: string
    password: string
    password_confirmation: string
  }): Promise<void> {
    await api.post('/auth/password/reset', payload)
  }

  async function refresh(): Promise<void> {
    await fetchMe()
  }

  return {
    user: readonly(user),
    pendingLegal: readonly(pendingLegal),
    isAuthenticated,
    needsVerification,
    isStaff,
    isCandidate,
    fetchMe,
    register,
    login,
    logout,
    verifyEmail,
    resendVerification,
    requestPasswordReset,
    resetPassword,
    refresh,
  }
}
