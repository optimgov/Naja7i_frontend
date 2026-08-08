import { proxyRequest } from 'h3'

/**
 * BFF — relais vers l'API Laravel.
 *
 * C'est LA pièce que cette tranche existe pour valider. Le navigateur ne parle
 * qu'à www.naja7i.ma ; ce relais transmet à l'API, de serveur à serveur.
 *
 * Trois points non évidents, chacun cause d'une panne difficile à diagnostiquer :
 *
 * 1. On NE transmet PAS `origin` ni `referer`. Sanctum s'en sert pour décider
 *    si une requête est « premier tiers ». Notre appel étant serveur-à-serveur,
 *    ces en-têtes désigneraient le navigateur du candidat et fausseraient la
 *    décision. Le middleware EnsureBffRequestsAreStateful côté Laravel traite
 *    précisément leur ABSENCE comme la signature d'un appel du BFF.
 *
 * 2. `cookieDomainRewrite` retire le domaine des cookies renvoyés par Laravel.
 *    Sans cela, un cookie posé pour un domaine d'API que le navigateur ne
 *    connaît pas serait silencieusement rejeté — session perdue, aucune erreur.
 *
 * 3. `x-forwarded-*` est transmis pour que Laravel connaisse l'adresse réelle
 *    du candidat. Elle sert à la limitation de tentatives et à la preuve de
 *    recueil des consentements ; sans ces en-têtes, tous les candidats
 *    partageraient l'IP du serveur Nuxt.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const path = event.path.replace(/^\/api/, '')
  const target = `${config.apiBaseUrl}/api${path}`

  const headers: Record<string, string> = {}

  for (const [key, value] of Object.entries(getRequestHeaders(event))) {
    if (value === undefined) continue

    const name = key.toLowerCase()

    // Voir point 1 : ces en-têtes ne doivent pas franchir le relais.
    if (name === 'origin' || name === 'referer' || name === 'host') continue

    headers[key] = value
  }

  const clientIp = getRequestIP(event, { xForwardedFor: true })
  if (clientIp) {
    headers['x-forwarded-for'] = clientIp
  }
  headers['x-forwarded-proto'] = config.public.appProtocol
  headers['accept'] = headers['accept'] ?? 'application/json'

  return proxyRequest(event, target, {
    headers,
    cookieDomainRewrite: '',
    fetchOptions: { redirect: 'manual' },
  })
})
