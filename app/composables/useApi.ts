/**
 * Client d'API unique. Aucun composant n'appelle `$fetch` directement — la
 * discipline du prototype est conservée : le jour où un contrat change, il n'y
 * a qu'un endroit à modifier.
 */

/** Forme réellement émise par l'API : un tableau, pas un dictionnaire. */
export interface ApiFieldError {
  field: string
  messages: string[]
}

export interface ApiError {
  code: string
  message: string
  request_id: string
  details?: ApiFieldError[] | Record<string, string[]>
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message)
  }

  /**
   * Erreurs de validation par champ, pour affichage sous chaque saisie.
   *
   * L'API renvoie `details` sous forme de TABLEAU — `[{field, messages}]` —
   * et non de dictionnaire `{champ: [messages]}`. Traiter le tableau comme un
   * dictionnaire produit les clés « 0 », « 1 »… dont la valeur est un objet
   * sans `.length` : tout est filtré et `fieldErrors` ressort vide. L'écran
   * bascule alors sur l'alerte générale et plus aucun message n'apparaît sous
   * le champ fautif — la validation semble muette alors qu'elle fonctionne.
   *
   * Les deux formes sont acceptées ici, pour ne pas dépendre d'un détail de
   * sérialisation côté API.
   */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {}
    const details = this.error.details
    if (!details) return out

    if (Array.isArray(details)) {
      for (const detail of details) {
        const premier = detail?.messages?.[0]
        if (detail?.field && premier) out[detail.field] = premier
      }
      return out
    }

    for (const [field, messages] of Object.entries(details)) {
      const premier = messages?.[0]
      if (premier) out[field] = premier
    }
    return out
  }
}

let csrfReady = false

/**
 * Le cookie XSRF-TOKEN est posé URL-encodé par Laravel. Oublier de le décoder
 * produit un 419 sur toutes les écritures, sans message explicite : c'est
 * l'erreur d'intégration Sanctum la plus fréquente.
 */
function readXsrfToken(): string | null {
  if (import.meta.server) return null

  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

async function ensureCsrf(): Promise<void> {
  if (csrfReady || import.meta.server) return
  await $fetch('/sanctum/csrf-cookie', { credentials: 'include' })
  csrfReady = true
}

export function useApi() {
  /*
   * Résolu ICI, pendant l'appel synchrone de `useApi()`, et surtout pas dans
   * `call()`. Un composable Vue exige un contexte actif ; après le premier
   * `await` (celui de `ensureCsrf`) ce contexte est perdu et `useI18n()` lève
   * « Must be called at the top of a `setup` function ». L'exception n'étant
   * pas une ApiRequestError, les écrans la filtrent en silence : la requête
   * n'part jamais et aucun message ne s'affiche.
   *
   * `$i18n` plutôt que `useI18n()` : `useApi()` est aussi appelé depuis les
   * middlewares de route, qui ne sont pas non plus un contexte de `setup`.
   */
  const { $i18n } = useNuxtApp()

  async function call<T>(
    path: string,
    options: { method?: string; body?: unknown; query?: Record<string, unknown> } = {},
  ): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase()
    const writes = method !== 'GET' && method !== 'HEAD'

    if (writes) await ensureCsrf()

    const headers: Record<string, string> = { Accept: 'application/json' }

    if (writes) {
      const token = readXsrfToken()
      if (token) headers['X-XSRF-TOKEN'] = token
    }

    // La langue de l'interface décide la langue des messages d'erreur.
    headers['Accept-Language'] = $i18n.locale.value

    try {
      return await $fetch<T>(`/api/v1${path}`, {
        method: method as never,
        body: options.body as never,
        query: options.query,
        headers,
        credentials: 'include',
      })
    } catch (e: unknown) {
      const response = e as { status?: number; data?: { error?: ApiError } }

      if (response?.data?.error) {
        throw new ApiRequestError(response.status ?? 500, response.data.error)
      }

      throw new ApiRequestError(response?.status ?? 500, {
        code: 'NETWORK_ERROR',
        message: $i18n.t('errors.network'),
        request_id: '',
      })
    }
  }

  return {
    get: <T>(path: string, query?: Record<string, unknown>) => call<T>(path, { query }),
    post: <T>(path: string, body?: unknown) => call<T>(path, { method: 'POST', body }),
    patch: <T>(path: string, body?: unknown) => call<T>(path, { method: 'PATCH', body }),
  }
}
