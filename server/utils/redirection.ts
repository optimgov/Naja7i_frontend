/**
 * `/calendrier` → 301 vers la vue « Par échéance » du tapis (arbitrage A3).
 *
 * Cette route n'existe pas comme page et ne doit pas exister : un « calendrier »
 * et un « tapis trié par échéance » sont la même chose vue deux fois. En faire
 * deux pages diviserait le référencement d'une intention unique et condamnerait
 * à maintenir deux écrans qui divergeront.
 *
 * 301 ET NON 302. Le permanent transmet l'autorité de l'ancienne adresse et
 * fait remplacer l'entrée dans l'index ; le temporaire garde l'ancienne
 * indexée et n'en transmet rien. Sur une zone publique dont le rôle EST
 * l'acquisition, ce choix se fait une fois et se fait bien.
 *
 * La cible ne porte PAS `?vue=echeance` : « par échéance » est la vue par
 * défaut, et l'écrire produirait deux adresses pour un même écran — le doublon
 * que cette redirection existe justement pour éviter.
 */
export function versLeTapis(event: import('h3').H3Event, langue: string | null) {
  const cible = langue === 'fr' || langue === 'ar' ? `/${langue}/opportunites` : '/opportunites'

  /* La chaîne de requête est transmise : `/calendrier?filiere=education` ne
   * doit pas perdre son filtre en route. */
  const [, ...reste] = event.path.split('?')
  const requete = reste.length ? `?${reste.join('?')}` : ''

  return sendRedirect(event, cible + requete, 301)
}
