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

/**
 * Ce qu'une capacité OUVRE, dit par le serveur et dans la langue de la page.
 *
 * C'est le référentiel bilingue de `CapabilityRegistry` qui le sert. L'écran
 * ne tient plus de correspondance code → libellé : une carte écrite dans un
 * gabarit vieillit à la première capacité ajoutée, et affiche alors soit un
 * code technique, soit rien.
 */
export interface DetailDeCapacite {
  code: string
  label: string
  description: string
}

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
  /** Les CODES, pour comparer. Jamais affichés : voir `capability_details`. */
  capabilities: string[]
  /** Les mêmes, présentés. C'est ce que l'écran rend. */
  capability_details: DetailDeCapacite[]
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

/**
 * La NATURE d'un droit, dite en mots du produit.
 *
 * Le serveur en sert le libellé (`source_label`) : on ne traduit pas ces trois
 * codes ici. Le type les nomme quand même, parce qu'un écran a le droit de
 * distinguer un sevrage annoncé d'un achat — pas pour l'écrire, pour le
 * classer.
 */
export type NatureDeDroit = 'essai' | 'achetee' | 'transitoire'

/**
 * UNE LIGNE PAR DROIT, avec sa date propre — S-03.
 *
 * Le serveur groupe par (nature, échéance) et trie ce qui s'arrête d'abord en
 * premier. L'écran RESTITUE cet ordre ; il ne le recalcule pas, et surtout il
 * n'additionne rien : deux droits datés ne font pas une durée cumulée. Un
 * « total » côté client serait un chiffre que personne n'a décidé.
 */
export interface LigneDeDroit {
  source: NatureDeDroit | string
  /** Le mot du produit, servi traduit. Jamais le code brut à l'écran. */
  source_label: string
  /** `null` = sans terme. On l'écrit, on ne fabrique pas de date. */
  expires_at: string | null
  capabilities: string[]
}

/**
 * Une enveloppe de questions, et son reliquat RÉEL (lot 3B).
 *
 * `remaining` est dérivé côté serveur — `granted` moins les consommations. Il
 * n'est ni recalculé, ni estimé, ni mis en cache ici : c'est le nombre que le
 * candidat lit avant d'engager un geste, et c'est le même que celui qui le
 * refusera.
 *
 * Une liste, jamais un total : deux enveloppes sur des portées distinctes ne
 * s'additionnent pas (ADR-0031).
 */
export interface Enveloppe {
  capability: string
  unit: string
  /** L'unité en toutes lettres, servie par le serveur. */
  unit_label: string
  granted: number
  remaining: number
  expires_at: string | null
  source: NatureDeDroit | string
  source_label: string
}

/** Les trois états d'ADR-0033. Le serveur tranche, l'écran ne déduit pas. */
export type EtatCommercial = 'actif' | 'essai' | 'epuise'

export interface EtatAbonnement {
  capabilities: string[]
  /** Par capacité. `null` pour une capacité sans terme. */
  expires_at: Record<string, string | null>
  /** L'état commercial, tranché par le serveur (ADR-0033). */
  etat: EtatCommercial
  /** Son libellé, servi traduit. */
  etat_label: string
  /**
   * LA SORTIE D'UN COMPTE ÉPUISÉ, dite par le serveur.
   *
   * `null` hors de l'état `epuise`. Un compte épuisé ne doit jamais se
   * retrouver devant une page vide sans issue — c'est le pire écran du
   * produit, et cette phrase est la moitié serveur de la réponse.
   */
  sortie: string | null
  droits: LigneDeDroit[]
  quotas: Enveloppe[]
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
