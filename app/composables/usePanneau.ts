import type { Ref } from 'vue'

/**
 * UN PANNEAU QUI S'OUVRE — méga-menu, menu « Plus », palette de recherche.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE COMPORTEMENT VIT DANS UN SEUL FICHIER
 *
 * Trois panneaux entrent dans l'en-tête avec ce lot, et ils doivent obéir aux
 * mêmes règles : ouverture au clic ET au clavier, fermeture par Échap, par un
 * clic extérieur et par un changement de route, focus RENDU au déclencheur, un
 * seul panneau ouvert à la fois.
 *
 * Écrites trois fois, ces règles auraient tenu trois fois — puis deux, puis
 * une. Le détail qu'on oublie en recopiant est toujours le même : le retour du
 * focus. Sans lui, un candidat au clavier ferme le méga-menu et se retrouve au
 * début du document, à retraverser la page entière pour revenir où il était.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UN SEUL PANNEAU OUVERT, ET C'EST UN ÉTAT PARTAGÉ
 *
 * `useState` porte l'identité du panneau ouvert. Ouvrir la recherche ferme donc
 * le méga-menu sans que l'un connaisse l'autre — et sans qu'un `watch` croisé
 * les couple. Deux panneaux superposés se recouvriraient, et le second volerait
 * le focus au premier.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE PANNEAU N'EXISTE PAS QUAND IL EST FERMÉ
 *
 * Ce composable ne fait que porter l'état ; c'est au gabarit d'employer `v-if`
 * et non `v-show`. Un panneau masqué en CSS reste dans l'arbre d'accessibilité :
 * un lecteur d'écran le lit, la tabulation le traverse, et le candidat parcourt
 * un menu invisible. C'est la même règle que la correction de la démonstration,
 * pour la même raison.
 */
export function usePanneau(
  nom: string,
  refs: { declencheur: Ref<HTMLElement | null>, panneau: Ref<HTMLElement | null> },
) {
  const ouvertGlobal = useState<string | null>('panneau.ouvert', () => null)
  const route = useRoute()

  const ouvert = computed(() => ouvertGlobal.value === nom)

  function ouvrir(): void {
    ouvertGlobal.value = nom
  }

  /**
   * `rendreFocus` est vrai par défaut, et faux dans un seul cas : la fermeture
   * provoquée par un clic AILLEURS. Reprendre le focus à ce moment-là le
   * volerait à l'élément que le candidat vient de désigner.
   */
  function fermer(rendreFocus = true): void {
    if (!ouvert.value) return
    ouvertGlobal.value = null

    if (rendreFocus) {
      nextTick(() => refs.declencheur.value?.focus())
    }
  }

  function basculer(): void {
    if (ouvert.value) fermer()
    else ouvrir()
  }

  if (import.meta.client) {
    /* Échap ferme, où que soit le focus DANS le panneau — d'où l'écoute sur le
       document plutôt que sur le panneau lui-même. */
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ouvert.value) {
        e.stopPropagation()
        fermer()
      }
    }

    /*
     * `pointerdown` et non `click` : un clic dont le bouton descend dans le
     * panneau et remonte dehors — une sélection de texte tirée trop loin —
     * fermerait le panneau au milieu du geste. `pointerdown` juge l'endroit où
     * le geste COMMENCE, qui est celui que le candidat a désigné.
     */
    const surPointeur = (e: PointerEvent) => {
      if (!ouvert.value) return

      const cible = e.target as Node | null
      if (!cible) return
      if (refs.panneau.value?.contains(cible)) return
      if (refs.declencheur.value?.contains(cible)) return

      fermer(false)
    }

    onMounted(() => {
      document.addEventListener('keydown', surTouche)
      document.addEventListener('pointerdown', surPointeur)
    })

    onBeforeUnmount(() => {
      document.removeEventListener('keydown', surTouche)
      document.removeEventListener('pointerdown', surPointeur)
      /* Un panneau démonté alors qu'il se croyait ouvert laisserait l'état
         partagé bloqué sur son nom : plus aucun autre panneau ne s'ouvrirait. */
      if (ouvert.value) ouvertGlobal.value = null
    })
  }

  /* Une navigation ferme le panneau. Sans cela, cliquer une entrée du méga-menu
     changerait de page en laissant le menu ouvert par-dessus la nouvelle. */
  watch(() => route.fullPath, () => {
    if (ouvert.value) ouvertGlobal.value = null
  })

  return { ouvert, ouvrir, fermer, basculer }
}
