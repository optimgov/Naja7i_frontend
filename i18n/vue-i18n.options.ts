/**
 * L'ACCORD DU NOM COMPTÉ EN ARABE — M-021, pas 4.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE
 *
 * `vue-i18n` applique par défaut la règle du français : « un » et « plusieurs ».
 * L'arabe n'accorde pas ainsi, et deux formes y produisent des fautes
 * mesurables — `/ar/tarifs` affichait « لمدة 30 أيام », qui est fauté.
 *
 * L'arabe accorde le nom selon le nombre :
 *
 *   1        singulier              يوم واحد
 *   2        DUEL, forme propre     يومان
 *   3 – 10   pluriel                أيام
 *   11 +     singulier ACCUSATIF    يوما
 *   0        se comporte comme 11+  يوما
 *
 * D'où quatre formes, dans cet ordre, séparées par `|` :
 *
 *   'يوم واحد | يومان | {n} أيام | {n} يوما'
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE QUE CETTE RÈGLE N'EST PAS
 *
 * Ce n'est pas le jeu complet des catégories CLDR (`zero`, `one`, `two`, `few`,
 * `many`, `other`). C'est la règle d'accord qui gouverne les quantités que ce
 * produit affiche — jours, questions, résultats, postes, annonces — et elle
 * s'arrête là. Un cas que ces quatre branches ne couvriraient pas serait un
 * cas à décider, pas à deviner.
 *
 * `scripts/verifier-quantites-arabes.mjs` rougit si une quantité arabe
 * repasse à deux formes. C'est lui le livrable durable, pas les quatre
 * libellés corrigés à la main.
 *
 * RÉSERVE INSCRITE, et elle vaut d'être relue : l'auteur n'est pas arabophone
 * natif. La règle grammaticale est nette et vérifiable ; le CHOIX des mots
 * (`يومان` plutôt qu'une autre tournure) sera relu par un arabophone au
 * jalon 2.
 */
export default defineI18nConfig(() => ({
  legacy: false,
  pluralRules: {
    /**
     * Rend l'index de la forme à employer, parmi les quatre déclarées.
     *
     * `nombreDeFormes` est passé par `vue-i18n` : une clé qui n'aurait pas
     * encore ses quatre branches ne doit pas rendre un index hors bornes — on
     * retombe alors sur la dernière forme disponible, qui est la moins fausse.
     */
    ar: (nombre: number, nombreDeFormes: number): number => {
      const index
        = nombre === 1 ? 0
          : nombre === 2 ? 1
            : nombre >= 3 && nombre <= 10 ? 2
              : 3

      return Math.min(index, Math.max(0, nombreDeFormes - 1))
    },
  },
}))
