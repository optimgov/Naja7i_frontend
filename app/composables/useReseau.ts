/**
 * État du réseau, partagé par toute l'application.
 *
 * `navigator.onLine` ment dans un sens seulement : à `false` il est fiable —
 * l'interface réseau est tombée — mais à `true` il affirme seulement qu'une
 * interface existe, pas qu'Internet répond. On s'en sert donc pour DÉTECTER la
 * coupure, jamais pour affirmer que tout va bien : c'est la file d'envoi qui,
 * en réussissant ou en échouant, tranche réellement.
 *
 * Au rendu serveur, `enLigne` vaut `true` : le serveur, lui, a bien répondu.
 */
export function useReseau() {
  const enLigne = useState<boolean>('reseau.enLigne', () => true)

  /**
   * Compteur d'échecs réseau consécutifs signalés par la file d'envoi. Deux
   * échecs de suite valent une coupure, même si `navigator.onLine` dit le
   * contraire — cas du portail captif d'un cybercafé, qui répond à tout par sa
   * propre page.
   */
  const echecsConsecutifs = useState<number>('reseau.echecs', () => 0)

  const coupe = computed(() => !enLigne.value || echecsConsecutifs.value >= 2)

  function signalerEchec(): void {
    echecsConsecutifs.value += 1
  }

  function signalerSucces(): void {
    echecsConsecutifs.value = 0
  }

  /**
   * Branché une seule fois, depuis le gabarit applicatif. Les écouteurs
   * `online`/`offline` n'existent que dans le navigateur.
   */
  function ecouter(): void {
    if (import.meta.server) return

    enLigne.value = navigator.onLine

    const monter = () => {
      enLigne.value = true
      echecsConsecutifs.value = 0
    }
    const tomber = () => {
      enLigne.value = false
    }

    window.addEventListener('online', monter)
    window.addEventListener('offline', tomber)

    onScopeDispose(() => {
      window.removeEventListener('online', monter)
      window.removeEventListener('offline', tomber)
    })
  }

  return { enLigne, coupe, signalerEchec, signalerSucces, ecouter }
}
