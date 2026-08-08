import { proxyRequest } from 'h3'

/**
 * Relais du cookie CSRF.
 *
 * Laravel pose ici deux cookies : la session (httpOnly) et XSRF-TOKEN (lisible
 * par le JavaScript). Le frontend lit le second et le renvoie en en-tête
 * X-XSRF-TOKEN sur chaque écriture. Sans cet appel préalable, toute requête
 * POST est rejetée en 419 — l'erreur la plus déroutante de Laravel, parce
 * qu'elle ne dit rien de sa cause.
 *
 * Route distincte du relais /api/** : Sanctum l'expose à la racine.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (value === undefined) continue
    const name = key.toLowerCase()
    if (name === 'origin' || name === 'referer' || name === 'host') continue
    headers[key] = value
  }

  return proxyRequest(event, `${config.apiBaseUrl}/sanctum/csrf-cookie`, {
    headers,
    cookieDomainRewrite: '',
  })
})
