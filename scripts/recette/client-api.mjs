/**
 * client-api.mjs — le client HTTP minimal partagé par les scripts de recette.
 *
 * Deux scripts parlent à l'API sous session : `preparer-comptes.mjs` et
 * `semer-banque.mjs`. Ils avaient besoin du même bocal à cookies, du même
 * en-tête XSRF et de la même lecture tolérante du corps ; le second l'aurait
 * recopié du premier.
 *
 * UN CLIENT = UNE IDENTITÉ. Le bocal est enfermé dans la fermeture : deux
 * identités ne peuvent pas se mélanger par accident, ce qui compte ici plus
 * qu'ailleurs — le semis mène la chaîne éditoriale sous trois métiers
 * différents, et une session qui déborde sur l'autre ferait valider une
 * question par son propre auteur.
 */

/** Un bocal à cookies minimal : `fetch` de Node n'en tient pas. */
function bocal() {
  const cookies = new Map()

  return {
    entete() {
      return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    },
    absorber(reponse) {
      for (const brut of reponse.headers.getSetCookie?.() ?? []) {
        const [paire] = brut.split(';')
        const i = paire.indexOf('=')
        if (i > 0) cookies.set(paire.slice(0, i).trim(), paire.slice(i + 1).trim())
      }
    },
    xsrf() {
      const v = cookies.get('XSRF-TOKEN')
      return v ? decodeURIComponent(v) : ''
    },
  }
}

/**
 * Un client porteur d'UNE session.
 *
 * @param {string} base  racine de l'API, sans barre finale
 */
export function client(base) {
  const sac = bocal()

  async function appel(chemin, options = {}) {
    const r = await fetch(`${base}${chemin}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: sac.entete(),
        ...(sac.xsrf() ? { 'X-XSRF-TOKEN': sac.xsrf() } : {}),
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'manual',
    })

    sac.absorber(r)

    const texte = await r.text()
    let corps = null
    try {
      corps = texte ? JSON.parse(texte) : null
    } catch {
      /* Une réponse non-JSON n'est pas une panne du client : c'est une page
       * d'erreur Laravel, et l'appelant la rendra telle quelle dans son
       * message. */
      corps = null
    }

    return { statut: r.status, corps, texte }
  }

  return {
    appel,

    /** Pose le cookie XSRF. Tout POST sous session en dépend. */
    async ouvrir() {
      await appel('/sanctum/csrf-cookie')
    },

    async connecter(email, motDePasse) {
      await appel('/sanctum/csrf-cookie')

      const r = await appel('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password: motDePasse },
      })

      if (r.statut >= 400) {
        throw new Error(`connexion refusée pour ${email} — ${r.statut} ${r.texte.slice(0, 200)}`)
      }

      return r
    },
  }
}

/**
 * Le jeton de vérification d'e-mail, LU DANS LA BOÎTE DE RÉCEPTION.
 *
 * Il vivait dans `preparer-comptes.mjs`, qui exécute du code au chargement :
 * l'importer pour cette seule fonction aurait créé les deux comptes A et B au
 * passage. Il descend donc ici, dans le module que les scripts partagent déjà
 * et qui, lui, ne fait rien à l'import.
 *
 * Lire le jeton dans Mailpit plutôt qu'en base éprouve au passage l'envoi réel.
 *
 * @param {string} email    l'adresse destinataire
 * @param {string} mailpit  racine de Mailpit, sans barre finale
 */
export async function jetonDeVerification(email, mailpit) {
  for (let essai = 0; essai < 20; essai++) {
    const liste = await fetch(`${mailpit}/api/v1/messages?limit=30`).then((r) => r.json())
    const message = liste.messages?.find((m) => m.To?.some((t) => t.Address === email))

    if (message) {
      const detail = await fetch(`${mailpit}/api/v1/message/${message.ID}`).then((r) => r.json())
      const corps = (detail.Text ?? '') + (detail.HTML ?? '')
      const trouve = corps.match(/token=([A-Za-z0-9]+)/)
      if (trouve) return trouve[1]
    }

    await new Promise((r) => setTimeout(r, 500))
  }

  return null
}

/** Le message d'erreur d'une réponse, sans noyer l'appelant sous le HTML. */
export function motif(reponse) {
  const e = reponse.corps?.error

  if (e) return `${e.code ?? '?'} — ${e.message ?? ''}`.trim()

  return reponse.texte.slice(0, 200).replace(/\s+/g, ' ')
}
