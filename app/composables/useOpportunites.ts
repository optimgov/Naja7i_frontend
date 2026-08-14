/**
 * Les opportunités — lecture, échéance, rattachement.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * L'ÉCHÉANCE PORTE TROIS CANAUX REDONDANTS. C'EST UNE RÈGLE MESURÉE.
 *
 * `valider-palette.mjs`, 9 août 2026 : safran-700 (#a3710d) et terre-700
 * (#94411f) sont à ΔE 4,8 en deutéranopie. Une échelle d'urgence à quatre
 * paliers colorés est donc IMPOSSIBLE — les paliers du milieu seraient
 * indistinguables pour une partie des candidats, sur l'information dont
 * dépend leur candidature.
 *
 * L'information est donc portée trois fois, et chaque canal se suffit :
 *
 *   1. LE LIBELLÉ ÉCRIT      « Clôture dans 3 jours »
 *   2. LA LONGUEUR DE JAUGE  fraction d'une fenêtre de 60 jours
 *   3. L'ICÔNE au palier imminent
 *
 * La couleur vient en QUATRIÈME, et elle est BINAIRE : imminent ou non. Elle
 * ne fait que redoubler une information déjà complète. Retirer la couleur ne
 * doit rien retirer au sens — c'est le test à faire passer à toute évolution
 * de ce fichier.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES NATURES D'ANNONCE NE SONT PAS CODÉES PAR COULEUR.
 *
 * Huit natures — concours, poste de responsabilité, stage, bourse… — n'ont
 * aucune échelle de couleur qui les distingue accessiblement. Elles se lisent
 * par leur nom, écrit. La pastille de nature est neutre, et c'est délibéré :
 * un jeu de huit couleurs aurait été joli et illisible.
 */

/** Ce que le collecteur sert. La forme ne change pas au branchement. */
export interface Annonce {
  id: string
  slug: string
  type: string
  stage: string
  titre: string
  resume: string
  org: string
  org_type: string
  ref: string | null
  grade: string | null
  echelle: string | null
  specialites: string[]
  postes: number | null
  regions: string[]
  deadline: string | null
  /** Recalculé par le BFF à la lecture — voir `_donnees/opportunites`. */
  jours: number | null
  exam: string | null
  publie: string
  mode: string
  url: string
  diplomes: string[]
  age: number | null
  docs: { label: string, url: string, mime: string, mirrored: boolean }[]
  source: { nom: string, url: string, fetched: string, officiel: boolean }
  naja7i: {
    filiere: string | null
    prep_slug: string | null
    has_prep: boolean
    match_reason: string | null
    confidence: number
  }
  revision: number
}

export interface MetaOpportunites {
  /** Marqueur CONTRACTUEL : l'écran l'affiche, il ne le fabrique jamais. */
  fixture: boolean
  collecte: string
  source: string
  total: number
}

export type PalierEcheance = 'close' | 'imminente' | 'ouverte'

export interface Echeance {
  palier: PalierEcheance
  /** Canal 1 — le libellé écrit. Clé i18n + paramètres, jamais du texte figé. */
  cle: string
  jours: number | null
  /** Canal 2 — la longueur de jauge, en pourcentage d'une fenêtre de 60 jours. */
  part: number
  /** Canal 3 — vrai au palier imminent seulement. */
  icone: boolean
}

/** La fenêtre qui donne son échelle à la jauge. Au-delà, elle est pleine. */
const FENETRE_JOURS = 60

/** En dessous, l'échéance est « imminente » : le seul palier qui porte une icône. */
const SEUIL_IMMINENT = 7

/**
 * L'échéance d'une annonce, sur ses trois canaux.
 *
 * `stage` prime sur `jours` : une annonce close ou annulée l'est quel que soit
 * le calendrier. Un concours dont les résultats sont tombés n'a pas d'échéance
 * de dépôt, même si sa date de clôture est dans le futur.
 */
export function echeanceDe(annonce: Annonce): Echeance {
  const j = annonce.jours

  const close = j === null || j < 0
    || annonce.stage === 'cloture' || annonce.stage === 'annule'
    || annonce.stage !== 'annonce'

  if (close) {
    return { palier: 'close', cle: 'opportunites.echeance_close', jours: j, part: 0, icone: false }
  }

  if (j <= SEUIL_IMMINENT) {
    return {
      palier: 'imminente',
      cle: j === 0
        ? 'opportunites.echeance_aujourdhui'
        : j === 1 ? 'opportunites.echeance_demain' : 'opportunites.echeance_jours',
      jours: j,
      /* Plancher à 3 % : une jauge à zéro se lit « rien » alors qu'il reste du
       * temps. Le canal doit rester VISIBLE tant qu'il porte une information. */
      part: Math.max(3, Math.round((j / FENETRE_JOURS) * 100)),
      icone: true,
    }
  }

  return {
    palier: 'ouverte',
    cle: 'opportunites.echeance_jours',
    jours: j,
    part: Math.min(100, Math.round((j / FENETRE_JOURS) * 100)),
    icone: false,
  }
}

export type EtatRattachement = 'prepare' | 'rattache' | 'aucun'

/**
 * LE RATTACHEMENT A TROIS ÉTATS, et on ne promet une préparation QUE si elle
 * existe.
 *
 *   `prepare`  — la filière est identifiée ET naja7i prépare ce concours.
 *                C'est le seul état qui autorise un lien vers une préparation.
 *   `rattache` — la filière est identifiée, mais rien n'est encore préparé.
 *                On le DIT. Taire la différence ferait passer une intention
 *                pour une offre.
 *   `aucun`    — le collecteur n'a pas su rattacher. L'annonce reste servie :
 *                elle est utile même sans préparation, et la masquer
 *                reviendrait à cacher au candidat un concours qui existe.
 *
 * Les deux derniers états ne sont PAS un échec à dissimuler. Ce produit agrège
 * plus large que ce qu'il prépare, et le dire est ce qui le rend crédible sur
 * ce qu'il prépare vraiment.
 */
export function rattachementDe(annonce: Annonce): EtatRattachement {
  if (annonce.naja7i.has_prep && annonce.naja7i.prep_slug) return 'prepare'
  if (annonce.naja7i.filiere) return 'rattache'
  return 'aucun'
}

/** Une annonce est-elle réellement ouverte au dépôt, aujourd'hui ? */
export function estOuverte(annonce: Annonce): boolean {
  return echeanceDe(annonce).palier !== 'close'
}

export function useOpportunites() {
  /**
   * La liste complète.
   *
   * `useAsyncData` place `undefined` dans `error`, pas `null` — on teste la
   * VÉRACITÉ partout où on s'en sert, sinon le repli s'affiche en permanence.
   *
   * POURQUOI `$fetch` ICI ET NON `useApi`, alors que la règle du dépôt dit
   * « un seul client ». Cette règle vise les COMPOSANTS, et sa raison est
   * écrite dans `useApi` : « le jour où un contrat change, il n'y a qu'un
   * endroit à modifier ». Ce fichier EST cet endroit pour les opportunités.
   *
   * `useApi` n'est pas un client HTTP générique : il porte le contrat Laravel —
   * préfixe `/api/v1`, jeton CSRF, enveloppe d'erreur `{code, message,
   * request_id}`. La route de fixture n'a rien de tout cela, et l'y faire
   * passer reviendrait à lui prêter un contrat qu'elle n'honore pas. Le jour
   * où le collecteur branche, cette lecture passera par `useApi` — et ce sera
   * une ligne, ici, parce qu'aucun composant n'aura jamais vu le `$fetch`.
   */
  const annonces = () =>
    useAsyncData('opportunites', () =>
      $fetch<{ data: Annonce[], meta: MetaOpportunites }>('/_donnees/opportunites'),
    )

  return { annonces, echeanceDe, rattachementDe, estOuverte }
}
