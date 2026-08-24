export type CategorieReclamation = 'technical' | 'pedagogical' | 'account' | 'payment' | 'other'
export type StatutReclamation = 'waiting_staff' | 'waiting_candidate'
export type EmetteurMessage = 'candidate' | 'staff'

export interface Reclamation {
  uuid: string
  category: CategorieReclamation
  subject: string
  status: StatutReclamation
  last_message_at: string
  created_at: string
}

export interface MessageReclamation {
  uuid: string
  sender: EmetteurMessage
  body: string
  created_at: string
}

export interface LiensPaginationReclamations {
  first: string | null
  last: string | null
  prev: string | null
  next: string | null
}

export interface MetaPaginationReclamations {
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export interface ListeReclamations {
  data: Reclamation[]
  links: LiensPaginationReclamations
  meta: MetaPaginationReclamations
}

export interface ListeMessagesReclamation {
  data: MessageReclamation[]
  links: LiensPaginationReclamations
  meta: MetaPaginationReclamations
}

export interface NouvelleReclamation {
  category: CategorieReclamation
  subject: string
  body: string
}

/**
 * Une intention d'écriture reçoit une clé opaque et unique.
 *
 * `randomUUID` est le chemin normal. Le repli par octets aléatoires couvre les
 * navigateurs qui exposent Web Crypto sans cette méthode ; le dernier repli ne
 * sert qu'aux contextes privés qui refusent entièrement Web Crypto. La page
 * conserve ensuite cette clé jusqu'au succès ou jusqu'à ce que la saisie
 * change : un simple nouvel essai ne peut donc pas créer de doublon.
 */
export function creerCleIdempotence(): string {
  const cryptoNavigateur = globalThis.crypto

  if (typeof cryptoNavigateur?.randomUUID === 'function') {
    return cryptoNavigateur.randomUUID()
  }

  if (typeof cryptoNavigateur?.getRandomValues === 'function') {
    const octets = cryptoNavigateur.getRandomValues(new Uint8Array(16))
    octets[6] = (octets[6]! & 0x0f) | 0x40
    octets[8] = (octets[8]! & 0x3f) | 0x80
    const hex = Array.from(octets, octet => octet.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  return `naja7i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Respecte l'ordre de lecture du fil sans modifier la collection de l'API. */
export function ordonnerMessagesChronologiquement(
  messages: MessageReclamation[],
): MessageReclamation[] {
  return [...messages].sort((premier, second) => {
    const datePremier = Date.parse(premier.created_at)
    const dateSecond = Date.parse(second.created_at)

    if (Number.isNaN(datePremier) || Number.isNaN(dateSecond)) return 0
    return datePremier - dateSecond
  })
}

export function useReclamations() {
  const api = useApi()

  const lister = (page = 1) =>
    api.get<ListeReclamations>('/me/complaints', { page })

  const creer = (payload: NouvelleReclamation, cleIdempotence: string) =>
    api.post<{ data: Reclamation }>('/me/complaints', payload, {
      'Idempotency-Key': cleIdempotence,
    })

  const lire = (uuid: string) =>
    api.get<{ data: Reclamation }>(`/me/complaints/${encodeURIComponent(uuid)}`)

  const messages = (uuid: string, page = 1) =>
    api.get<ListeMessagesReclamation>(
      `/me/complaints/${encodeURIComponent(uuid)}/messages`,
      { page },
    )

  const repondre = (uuid: string, body: string, cleIdempotence: string) =>
    api.post<{ data: MessageReclamation }>(
      `/me/complaints/${encodeURIComponent(uuid)}/messages`,
      { body },
      { 'Idempotency-Key': cleIdempotence },
    )

  return { lister, creer, lire, messages, repondre }
}
