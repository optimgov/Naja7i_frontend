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

  /*
   * COOKIES AU RENDU SERVEUR
   *
   * `credentials: 'include'` ne veut rien dire côté serveur : il n'y a pas de
   * navigateur pour joindre les cookies. Sans ce relais, toute requête émise
   * pendant le rendu part ANONYME — `fetchMe` échoue, la garde de route conclut
   * que personne n'est connecté, et l'entrée directe sur une URL protégée
   * rebondit vers la connexion, qui renvoie aussitôt un candidat authentifié
   * vers son tableau de bord.
   *
   * Symptôme observé : impossible d'ouvrir une tentative par son adresse, ni de
   * recharger la page pendant une passation. C'est-à-dire précisément ce que la
   * reprise sur un second appareil demande de faire.
   *
   * Résolu ici, avec `$i18n`, et pas dans `call()` : après le premier `await`,
   * le contexte Nuxt n'est plus actif et `useRequestHeaders` lèverait.
   */
  const enteteCookie = import.meta.server ? useRequestHeaders(['cookie']) : {}

  async function call<T>(
    path: string,
    options: {
      method?: string
      body?: unknown
      query?: Record<string, unknown>
      headers?: Record<string, string>
    } = {},
  ): Promise<T> {
    const method = (options.method ?? 'GET').toUpperCase()
    const writes = method !== 'GET' && method !== 'HEAD'

    /*
     * L'amorçage CSRF est DANS la gestion d'erreur, pas avant.
     *
     * Il était placé au-dessus du `try`, et sa panne remontait donc telle
     * quelle — une `FetchError` brute, pas une `ApiRequestError`. Conséquence
     * mesurée par la recette : hors connexion, une réponse de passation
     * n'atteignait jamais la file d'envoi. L'appelant ne reconnaissait pas
     * l'erreur, la relançait, et le travail du candidat était perdu — très
     * exactement ce que la file existe pour empêcher.
     *
     * Le cas est fréquent : `csrfReady` est un drapeau de module, remis à zéro
     * à chaque rechargement de page. Il suffit de recharger puis de perdre le
     * réseau pour tomber dedans.
     *
     * Ne pas joindre le cookie CSRF veut dire qu'on n'a pas pu atteindre le
     * serveur : c'est une panne de réseau, et elle se déclare comme telle.
     */
    if (writes) {
      try {
        await ensureCsrf()
      } catch {
        throw new ApiRequestError(0, {
          code: 'NETWORK_ERROR',
          message: $i18n.t('errors.network'),
          request_id: '',
        })
      }
    }

    /*
     * Les en-têtes de l'appelant sont posés EN PREMIER, puis recouverts par les
     * en-têtes calculés. C'est par là que passe `Idempotency-Key`. L'ordre
     * compte : dans l'autre sens, un appelant écraserait `X-XSRF-TOKEN` par
     * mégarde et provoquerait un 419 dont la cause serait introuvable.
     */
    const headers: Record<string, string> = { ...enteteCookie, ...(options.headers ?? {}) }

    headers.Accept = 'application/json'

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
    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      call<T>(path, { method: 'POST', body, headers }),
    patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      call<T>(path, { method: 'PATCH', body, headers }),
    /*
     * L'enregistrement d'une réponse est un PUT — `PUT …/items/{uuid}`, rejouable
     * sans effet de bord. Son absence ici rendait la passation impossible à
     * écrire : c'est la première dette de FRONT-1 levée par ce lot.
     */
    put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      call<T>(path, { method: 'PUT', body, headers }),
  }
}
