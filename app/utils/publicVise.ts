/**
 * LA CONDITION DE PUBLIC — M-009, pas 5.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * UNE CATÉGORIE DE PUBLIC, LA MÊME FORME DES DEUX CÔTÉS
 *
 * Elle sort de l'offre (`PlanResource`) et du profil du candidat
 * (`CandidateProfileResource`), et dans les deux cas la clé DISPARAÎT quand il
 * n'y a rien à dire — jamais `null`. Les deux absences ne veulent pourtant pas
 * dire la même chose, et c'est tout l'objet de `conditionDePublic()` :
 *
 *   · absente sur l'OFFRE   → « ouverte à tout le monde ». Une CERTITUDE.
 *   · absente sur le PROFIL → « on ne sait pas ». Une IGNORANCE.
 *
 * Les DEUX libellés sont servis, pas seulement celui de la locale courante :
 * le `code` sert à comparer, les libellés à écrire, et changer de langue ne
 * doit pas obliger à redemander le catalogue pour une phrase de trois mots.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EST ICI, ET PAS DANS `useAbonnement`
 *
 * La règle est PURE : deux catégories entrent, une décision sort. Elle ne lit
 * ni session, ni réseau, ni écran. La poser hors du composable la rend
 * chargeable par `scripts/verifier-condition-de-public.mjs` sans traîner le
 * client d'API derrière elle — et une règle qu'on ne peut pas éprouver est une
 * règle qu'on croit juste.
 */

export interface CategorieDePublic {
  code: string
  label_fr: string
  label_ar: string
}

/**
 * Rend la catégorie à ANNONCER, ou `null` quand il n'y a rien à dire.
 *
 * Une seule fonction, et les deux conséquences en découlent : on écrit la
 * mention quand elle rend quelque chose, on propose le bouton quand elle rend
 * `null`. Les tenir séparément serait se donner deux occasions de se
 * contredire — et le jour venu, l'écran dirait « réservée aux CRMEF » sous un
 * bouton qui la propose.
 *
 * ON NE PARLE QUE DANS UN SEUL CAS : condition posée, catégorie connue, et les
 * deux diffèrent. Les trois autres se proposent, chacun pour sa raison :
 *
 *   offre sans public      → ouverte à tout le monde ;
 *   profil sans catégorie  → ON NE SAIT PAS, et c'est là que tout se joue.
 *                            Fermer sur une ignorance serait PLUS STRICT QUE
 *                            LE SERVEUR, donc faux : il ne refuse que ce qu'il
 *                            sait, et une souscription passe quand la
 *                            catégorie est inconnue. C'est aussi le cas du
 *                            visiteur anonyme, qui n'a pas de profil du tout ;
 *   mêmes codes            → l'offre lui est destinée.
 *
 * Les deux absences se ressemblent et ne disent pas la même chose. Les
 * confondre produit l'un de deux défauts opposés : refuser une vente à qui
 * paierait, ou promettre une offre qu'on refusera.
 *
 * ON COMPARE DES CODES, JAMAIS DES LIBELLÉS : un libellé se traduit, se
 * corrige, et change de casse le jour où quelqu'un le trouve mal écrit.
 *
 * La signature prend les deux CATÉGORIES et non les deux objets : la règle ne
 * regarde rien d'autre, et l'écrire ainsi lui interdit d'aller chercher un
 * champ de plus le jour où l'on se demandera « et si… ».
 */
export function conditionDePublic(
  offre: CategorieDePublic | undefined,
  candidat: CategorieDePublic | undefined,
): CategorieDePublic | null {
  if (offre === undefined) return null
  if (candidat === undefined) return null

  return offre.code === candidat.code ? null : offre
}
