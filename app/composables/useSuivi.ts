/**
 * Trace locale de ce que le candidat vient de faire : épreuve suivie, dernière
 * tentative ouverte.
 *
 * POURQUOI C'EST LOCAL, ET POURQUOI CE N'EST PAS UNE DONNÉE INVENTÉE
 *
 * Le contrat n'expose ni profil du candidat (PAS-5, à venir) ni index des
 * tentatives : il n'y a que `GET me/attempts/{uuid}`, qui exige de connaître
 * l'identifiant. Le tableau de bord ne peut donc pas DEMANDER au serveur quelle
 * épreuve est suivie — l'information n'existe pas côté serveur.
 *
 * Ce composable ne fabrique aucun chiffre : il se souvient de ce que le
 * navigateur a fait, et rien d'autre. Tout ce qui est affiché à partir de cette
 * trace est ensuite rechargé depuis l'API — la trace ne sert qu'à savoir QUOI
 * demander. Si elle est absente, l'écran le dit et propose de choisir une
 * épreuve ; il n'affiche jamais un état de préparation supposé.
 *
 * À remplacer par le profil dès que PAS-5 l'expose.
 */

export interface Suivi {
  codeEpreuve: string
  nomEpreuve: string
  derniereTentative: string | null
  vuA: number
}

const CLE = 'naja7i.suivi'

export function useSuivi() {
  const suivi = useState<Suivi | null>('suivi.courant', () => null)

  function relire(): Suivi | null {
    if (import.meta.server) return null
    try {
      const brut = localStorage.getItem(CLE)
      suivi.value = brut ? (JSON.parse(brut) as Suivi) : null
    } catch {
      suivi.value = null
    }
    return suivi.value
  }

  function noter(entree: Omit<Suivi, 'vuA'>): void {
    const complet: Suivi = { ...entree, vuA: Date.now() }
    suivi.value = complet
    if (import.meta.server) return
    try {
      localStorage.setItem(CLE, JSON.stringify(complet))
    } catch {
      /* stockage refusé : la trace ne vaut que pour la session en cours */
    }
  }

  function oublier(): void {
    suivi.value = null
    if (import.meta.server) return
    try {
      localStorage.removeItem(CLE)
    } catch {
      /* rien à faire */
    }
  }

  return { suivi, relire, noter, oublier }
}
