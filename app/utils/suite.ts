/**
 * `?suite=` — LA DESTINATION QUE LE VISITEUR AVAIT CHOISIE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE RÈGLE VIT DANS UN SEUL FICHIER
 *
 * Le contrôle était écrit dans `connexion.vue`, et nulle part ailleurs. Or la
 * destination doit maintenant traverser quatre écrans — connexion, inscription,
 * vérification d'e-mail, puis la route protégée elle-même — et deux gardes de
 * route. Recopier la vérification cinq fois, c'est garantir que l'une des cinq
 * copies divergera : il suffit d'une pour rouvrir la redirection ouverte.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SEULS LES CHEMINS INTERNES SONT SUIVIS
 *
 * `//evil.example` et `https://evil.example` sont des URL ABSOLUES qu'un
 * navigateur suivrait hors du site : accepter la valeur telle quelle ferait de
 * la page de connexion une redirection ouverte, offerte à qui envoie un lien
 * piégé.
 *
 * La contre-barre est refusée avec le reste : les navigateurs la normalisent en
 * barre oblique au moment de résoudre l'URL, si bien que `/\evil.example` se
 * relit `//evil.example`. Le contrôle porterait alors sur une chaîne que
 * personne ne suit.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ET UNE SUITE NE RAMÈNE JAMAIS DANS LE TUNNEL D'AUTHENTIFICATION
 *
 * `?suite=/fr/connexion` est un chemin interne parfaitement valide, et il
 * produit une boucle : la garde `guest` renvoie un candidat connecté vers sa
 * suite, qui le ramène sur la connexion, qui le renvoie vers sa suite. Le
 * navigateur s'arrête de lui-même après quelques tours, mais le candidat, lui,
 * ne va nulle part. Les cinq écrans du tunnel sont donc exclus ici, une fois.
 */

/** Les écrans qui ne peuvent JAMAIS être une destination de retour. */
const TUNNEL = [
  '/connexion',
  '/inscription',
  '/verifier-email',
  '/mot-de-passe-oublie',
  '/nouveau-mot-de-passe',
]

/** Le chemin sans son préfixe de langue : `/fr/connexion` et `/ar/connexion`
 *  sont le même écran, et la liste ci-dessus n'a pas à le dire deux fois. */
function sansLangue(chemin: string): string {
  return chemin.replace(/^\/(fr|ar)(?=\/|$)/, '') || '/'
}

/**
 * La suite, si elle est suivable. `null` sinon — jamais une valeur repliée.
 *
 * Accepte ce que rend `route.query`, qui peut être une chaîne, un tableau
 * (`?suite=a&suite=b`), `null` ou `undefined`.
 */
export function suiteInterne(valeur: unknown): string | null {
  const brut = Array.isArray(valeur) ? valeur[0] : valeur

  if (typeof brut !== 'string' || brut === '') return null
  if (!/^\/(?![/\\])/.test(brut)) return null

  const chemin = sansLangue(brut.split('?')[0]!.split('#')[0]!)
  if (TUNNEL.some((t) => chemin === t || chemin.startsWith(`${t}/`))) return null

  return brut
}

/**
 * Accroche une suite à un chemin — sans rien accrocher s'il n'y a rien à dire.
 *
 * Le séparateur est choisi d'après le chemin : une destination qui porte déjà
 * une requête (`/app/abonnement?plan=…`) recevrait sinon un second `?`, et la
 * suite serait perdue dans le nom du paramètre.
 */
export function avecSuite(chemin: string, suite: string | null | undefined): string {
  const valide = suiteInterne(suite)
  if (!valide) return chemin

  return `${chemin}${chemin.includes('?') ? '&' : '?'}suite=${encodeURIComponent(valide)}`
}
