import { ApiRequestError } from './useApi'

/**
 * File d'envoi des écritures qui ne doivent pas se perdre.
 *
 * CE QU'ELLE PROTÈGE
 *
 * Une réponse à une question de diagnostic est un travail du candidat, pas un
 * clic. Si le réseau tombe, si la session expire, si l'onglet est fermé, cette
 * réponse doit survivre — sinon le candidat recommence, et il ne recommence
 * pas : il abandonne.
 *
 * POURQUOI C'EST SÛR
 *
 * Le contrat le garantit : `PUT …/items/{uuid}` est rejouable sans effet de
 * bord. La file peut donc réémettre sans compter ses tentatives, et deux
 * envois de la même réponse laissent le serveur dans le même état qu'un seul.
 * C'est cette propriété — et elle seule — qui autorise à rejouer aveuglément.
 *
 * DÉDOUBLONNAGE PAR CHEMIN
 *
 * Répondre deux fois à la même question hors connexion ne produit pas deux
 * envois : le second remplace le premier dans la file. Le serveur reçoit le
 * dernier état, qui est le seul qui ait un sens. Sans cela, la reconnexion
 * rejouerait un historique de brouillons.
 *
 * PERSISTANCE
 *
 * `localStorage`, parce que la file doit survivre à un rechargement et à une
 * fermeture d'onglet — les deux gestes que fait quelqu'un dont la page ne
 * répond plus. La file n'est PAS l'état d'affichage : elle ne contient que ce
 * qui reste à écrire.
 */

export interface EnvoiEnAttente {
  /** Chemin d'API, sans le préfixe `/api/v1`. Sert aussi de clé de dédoublonnage. */
  chemin: string
  corps: unknown
  /** Horodatage local, pour l'ordre d'émission. */
  pose: number
}

const CLE_STOCKAGE = 'naja7i.file-envoi'

function lireStockage(): EnvoiEnAttente[] {
  if (import.meta.server) return []
  try {
    const brut = localStorage.getItem(CLE_STOCKAGE)
    if (!brut) return []
    const lu: unknown = JSON.parse(brut)
    return Array.isArray(lu) ? (lu as EnvoiEnAttente[]) : []
  } catch {
    // Stockage illisible ou refusé (navigation privée stricte) : la file
    // fonctionne en mémoire. On ne fait pas échouer la passation pour ça.
    return []
  }
}

function ecrireStockage(file: EnvoiEnAttente[]): void {
  if (import.meta.server) return
  try {
    localStorage.setItem(CLE_STOCKAGE, JSON.stringify(file))
  } catch {
    /* voir ci-dessus */
  }
}

export function useFileEnvoi() {
  const api = useApi()
  const reseau = useReseau()

  const file = useState<EnvoiEnAttente[]>('file.envoi', () => [])
  /** Vrai quand le serveur a répondu 401 : la file attend une ré-authentification. */
  const reauthRequise = useState<boolean>('file.reauth', () => false)
  const enCours = useState<boolean>('file.enCours', () => false)

  const enAttente = computed(() => file.value.length)

  /** Recharge la file persistée. Appelé au montage du gabarit applicatif. */
  function reprendre(): void {
    if (import.meta.server) return
    file.value = lireStockage()
  }

  function poser(chemin: string, corps: unknown): void {
    // Dédoublonnage : le dernier état d'une même ressource remplace le précédent.
    const reste = file.value.filter((e) => e.chemin !== chemin)
    file.value = [...reste, { chemin, corps, pose: Date.now() }]
    ecrireStockage(file.value)
  }

  /**
   * Tente d'écouler la file, dans l'ordre de pose. S'arrête à la première
   * difficulté plutôt que de continuer : si le réseau est coupé, insister sur
   * les suivants ne fera qu'allonger l'attente ; si la session a expiré, tous
   * échoueront pareil.
   *
   * Retourne le nombre d'envois réellement passés.
   */
  async function ecouler(): Promise<number> {
    if (import.meta.server || enCours.value) return 0
    if (reauthRequise.value) return 0

    enCours.value = true
    let passes = 0

    try {
      while (file.value.length) {
        const premier = file.value[0]!

        try {
          await api.put(premier.chemin, premier.corps)
          file.value = file.value.slice(1)
          ecrireStockage(file.value)
          reseau.signalerSucces()
          passes += 1
        } catch (e: unknown) {
          if (e instanceof ApiRequestError && e.status === 401) {
            // La session a expiré. On NE JETTE RIEN : la réponse reste en file
            // et repartira après la ré-authentification. C'est tout l'intérêt.
            reauthRequise.value = true
            break
          }

          if (e instanceof ApiRequestError && e.error.code === 'NETWORK_ERROR') {
            reseau.signalerEchec()
            break
          }

          /*
           * Refus définitif du serveur (422, 409, 404…). Rejouer ne changera
           * rien : l'envoi sort de la file, sans quoi il la bloquerait pour
           * toujours et tous les envois suivants avec elle. Le composable
           * appelant a déjà reçu l'erreur au premier essai — c'est lui qui
           * parle au candidat, pas la file.
           */
          file.value = file.value.slice(1)
          ecrireStockage(file.value)
        }
      }
    } finally {
      enCours.value = false
    }

    return passes
  }

  /** Après une ré-authentification réussie : la file reprend là où elle en était. */
  async function reprendreApresAuth(): Promise<number> {
    reauthRequise.value = false
    return await ecouler()
  }

  function purger(): void {
    file.value = []
    ecrireStockage([])
  }

  return { file, enAttente, reauthRequise, reprendre, poser, ecouler, reprendreApresAuth, purger }
}
