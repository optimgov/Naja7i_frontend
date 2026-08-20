/**
 * La recherche globale, côté client.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI `$fetch` ICI ET NON `useApi`, alors que la règle du dépôt dit
 * « un seul client »
 *
 * C'est le même raisonnement que `useOpportunites`, et il est écrit dans
 * `useApi` : la règle vise les COMPOSANTS, et sa raison est « le jour où un
 * contrat change, il n'y a qu'un endroit à modifier ». Ce fichier EST cet
 * endroit pour la recherche.
 *
 * `useApi` n'est pas un client HTTP générique : il porte le contrat Laravel —
 * préfixe `/api/v1`, jeton CSRF, enveloppe d'erreur `{code, message,
 * request_id}`. La route d'agrégation n'a rien de tout cela, et l'y faire
 * passer reviendrait à lui prêter un contrat qu'elle n'honore pas. Le jour où
 * Laravel servira une recherche unifiée, ce sera une ligne, ici, parce
 * qu'aucun composant n'aura jamais vu le `$fetch`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DEUX CARACTÈRES, ET LA RÈGLE EST DES DEUX CÔTÉS
 *
 * Le serveur la fait respecter — c'est lui qui protège l'index. Le client
 * l'applique aussi, pour ne pas émettre une requête dont il connaît d'avance la
 * réponse à chaque première frappe.
 */

export interface EntreeRecherche {
  type: 'filiere' | 'famille' | 'specialite' | 'opportunite'
  titre: string
  contexte: string
  /** Chemin SANS préfixe de langue : c'est `localePath` qui l'ajoute. */
  chemin: string
  etat: string | null
}

export interface ReponseRecherche {
  data: EntreeRecherche[]
  meta: {
    q: string
    total: number
    trop_court: boolean
    sources: { catalogue: boolean, opportunites: boolean }
  }
}

/** L'ordre des groupes à l'écran. Il ne dépend pas de ce que le serveur rend. */
export const TYPES_RECHERCHE = ['filiere', 'famille', 'specialite', 'opportunite'] as const

export const MINIMUM_CARACTERES = 2

export function useRecherche() {
  const { locale } = useI18n()

  const vide: ReponseRecherche = {
    data: [],
    meta: { q: '', total: 0, trop_court: true, sources: { catalogue: false, opportunites: false } },
  }

  async function chercher(q: string, limite = 8): Promise<ReponseRecherche> {
    if (q.trim().length < MINIMUM_CARACTERES) return vide

    return await $fetch<ReponseRecherche>('/_recherche', {
      query: { q, locale: locale.value, limite },
    })
  }

  /**
   * Les résultats groupés par type, dans l'ordre d'affichage, sans groupe vide.
   *
   * Un groupe vide affiché — « Annales : aucun » — annonce un contenu qui
   * n'existe pas encore. On ne rend que ce qui a répondu.
   */
  function grouper(entrees: EntreeRecherche[]) {
    return TYPES_RECHERCHE
      .map((type) => ({ type, entrees: entrees.filter((e) => e.type === type) }))
      .filter((groupe) => groupe.entrees.length > 0)
  }

  return { chercher, grouper }
}
