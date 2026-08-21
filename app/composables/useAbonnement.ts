import { ApiRequestError } from './useApi'

/**
 * L'abonnement : les offres, l'état, les commandes.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE COMPOSABLE NE DÉCIDE D'AUCUN DROIT
 *
 * Il lit ce que le serveur dit du candidat. Le mur payant, lui, ne passe pas
 * par ici : il lit `cause_locked` sur la correction, servi par le contrat. Un
 * écran qui déduirait « il est abonné donc la cause est ouverte » aurait deux
 * sources de vérité, et la seconde se tromperait le jour où un octroi expire
 * pendant la session.
 *
 * La règle du dépôt est tenue : `useApi` est le seul client.
 */

export interface Plan {
  code: string
  name: string
  description: string | null
  price_cents: number
  currency: string
  /** Nul = sans terme. L'écran écrit « sans limite de durée », il n'invente pas. */
  duration_days: number | null
  /** Version contractuelle opaque à renvoyer lors de la souscription. */
  version_uuid: string
  capabilities: string[]
}

export interface Commande {
  uuid: string
  status: 'en_attente' | 'honoree' | 'annulee' | 'expiree'
  method: 'coupon' | 'simule'
  amount_cents: number
  currency: string
  created_at: string
  honored_at: string | null
  plan?: { code: string, name: string }
}

export interface EtatAbonnement {
  capabilities: string[]
  /** Par capacité. `null` pour une capacité sans terme. */
  expires_at: Record<string, string | null>
  pending_orders: number
}

/**
 * LE PAIEMENT SIMULÉ N'EST PAS ICI, ET C'EST DÉLIBÉRÉ.
 *
 * Son appel réseau et son interface vivent dans `PaiementSimule.vue`, chargé
 * par un `import()` dynamique derrière `import.meta.dev`. Le laisser dans ce
 * composable partagé aurait mis `orders/simulated` dans le bundle de
 * production — mesuré : ma première écriture le faisait, et le commentaire
 * affirmait le contraire.
 *
 * Une garantie de compilation qu'on n'a pas grepée dans `.output/` est une
 * supposition. La recette la vérifie.
 */

export function useAbonnement() {
  const api = useApi()

  /** Les offres — route PUBLIQUE, lisible sans session. */
  const plans = () =>
    useAsyncData('plans', () => api.get<{ data: Plan[] }>('/plans'), {
      transform: r => r.data,
    })

  const etat = () =>
    useAsyncData('abonnement.etat', () => api.get<{ data: EtatAbonnement }>('/me/subscription'), {
      transform: r => r.data,
    })

  const commandes = () =>
    useAsyncData('abonnement.commandes', () => api.get<{ data: Commande[] }>('/me/orders'), {
      transform: r => r.data,
    })

  /**
   * Saisir un coupon. La commande naît EN ATTENTE — jamais honorée.
   *
   * L'appelant DOIT le dire à l'écran : « votre code est en cours de
   * validation ». Laisser croire à une ouverture immédiate produirait un
   * candidat qui recharge sa correction en boucle sans comprendre.
   */
  async function saisirCoupon(code: string): Promise<Commande> {
    const reponse = await api.post<{ data: Commande }>(
      '/me/orders/coupon',
      { code },
      { 'Idempotency-Key': crypto.randomUUID() },
    )

    return reponse.data
  }

  return { plans, etat, commandes, saisirCoupon, ApiRequestError }
}

/**
 * Un prix, en toutes lettres.
 *
 * LE MONTANT VIENT EN CENTIMES et la mise en forme appartient à l'écran — le
 * serveur ne fige pas une convention typographique que le RTL contredirait.
 *
 * `nombre()` pose la fine insécable de milliers : sans elle, « 4 200 » se lit
 * « 200 4 » en arabe. Et la devise est celle de l'objet, jamais « MAD » en
 * dur : le modèle la porte depuis le premier jour, précisément pour qu'on ne
 * la suppose pas.
 */
export function prixEnClair(centimes: number, devise: string): string {
  const entier = Math.floor(centimes / 100)
  const decimales = centimes % 100

  const montant = decimales === 0
    ? nombre(entier)
    : `${nombre(entier)},${String(decimales).padStart(2, '0')}`

  return `${montant} ${devise}`
}
