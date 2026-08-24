import { proxyRequest, type H3Event } from 'h3'

/**
 * Relais des surfaces web Laravel (Filament et Livewire).
 *
 * Le conteneur Laravel reste invisible depuis le réseau de bord : Nuxt est
 * toujours l'unique porte d'entrée. Contrairement au relais `/api`, celui-ci
 * conserve l'Accept du navigateur afin que Laravel rende du HTML et des
 * ressources statiques.
 */
export async function proxyLaravelWeb(event: H3Event) {
  const config = useRuntimeConfig()
  const headers: Record<string, string> = {}

  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (value === undefined) continue

    const name = key.toLowerCase()
    if (name === 'origin' || name === 'referer' || name === 'host') continue

    headers[key] = value
  }

  const clientIp = getRequestIP(event, { xForwardedFor: true })
  if (clientIp) headers['x-forwarded-for'] = clientIp
  headers['x-forwarded-proto'] = config.public.appProtocol

  return proxyRequest(event, `${config.apiBaseUrl}${event.path}`, {
    headers,
    cookieDomainRewrite: '',
    fetchOptions: { redirect: 'manual' },
  })
}
