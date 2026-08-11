/**
 * Thème clair / sombre.
 *
 * POURQUOI UN COOKIE ET PAS `localStorage`
 *
 * `localStorage` n'existe pas au rendu serveur. La page part donc en clair,
 * arrive dans le navigateur, et un script la repeint en sombre : le candidat
 * voit un éclair blanc à chaque chargement. Ce clignotement est pire que
 * l'absence de mode sombre — il se produit sur CHAQUE navigation d'entrée, et
 * de nuit il éblouit précisément la personne qui a demandé le sombre.
 *
 * `useCookie` est lu par le serveur pendant le rendu. L'attribut `data-theme`
 * part donc déjà posé dans le HTML : il n'y a aucun instant où le document
 * porte le mauvais thème, et donc rien à repeindre.
 *
 * POURQUOI PAS `prefers-color-scheme`
 *
 * Le socle v3 le dit en toutes lettres au-dessus de son bloc sombre : « choisi
 * pas à pas, jamais une inversion automatique ». On ne suit donc pas la
 * préférence système par défaut. La valeur d'origine est le clair, et le
 * sombre est un choix posé. Ce n'est pas une préférence d'implémentation :
 * c'est la règle du socle, et l'y contredire ferait diverger l'interface de sa
 * référence de conception.
 */

export type Theme = 'clair' | 'sombre'

const COOKIE = 'naja7i_theme'

export function useTheme() {
  /*
   * `default` fixe la valeur au premier rendu, serveur comme client — les deux
   * calculent donc le même HTML, sans écart d'hydratation.
   *
   * Un an de conservation : le thème est un réglage, pas une session. `sameSite
   * lax` suffit — le cookie n'est jamais lu en contexte tiers — et il n'est pas
   * `httpOnly` puisque la bascule l'écrit depuis le navigateur.
   */
  const theme = useCookie<Theme>(COOKIE, {
    default: () => 'clair',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    path: '/',
  })

  const estSombre = computed(() => theme.value === 'sombre')

  function basculer(): void {
    theme.value = estSombre.value ? 'clair' : 'sombre'
  }

  return { theme, estSombre, basculer }
}

/**
 * Pose `data-theme` sur `<html>`. Appelé une seule fois, depuis `app.vue`, pour
 * que tous les gabarits en héritent — un appel par gabarit produirait deux
 * sources concurrentes sur le même attribut.
 *
 * L'attribut n'est écrit QUE pour le sombre : le clair est l'état sans
 * attribut, exactement comme `:root` sans sélecteur dans `tokens.css`. Poser
 * `data-theme="clair"` marcherait aussi, mais ferait diverger le DOM du CSS de
 * référence, et la prochaine reprise du socle par `cp` deviendrait un piège.
 */
export function useThemeApplique() {
  const { theme } = useTheme()

  useHead({
    htmlAttrs: {
      'data-theme': () => (theme.value === 'sombre' ? 'sombre' : undefined),
    },
  })
}
