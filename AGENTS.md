# Naja7i — frontend (Nuxt 3)

## Protocole de décision — à lire en premier

**Par défaut, tu décides et tu avances.** Tu rends compte de tes décisions dans
le rapport final, avec leur raison. Tu ne demandes pas la permission pour ce que
tu peux défaire.

Décide seul, sans demander : nommage, découpage des composants, structure CSS,
choix de composable, découpage des commits, refactor local, ajout d'un test,
correction d'un typage, ordre des étapes. Si deux options se valent, prends celle
qui suit ce qui existe déjà, et dis en une ligne pourquoi.

**Arrête-toi et demande uniquement dans ces cinq cas :**

1. L'action est **irréversible** : `git push`, une suppression de fichiers hors
   du dépôt, une écriture en production.
2. C'est une **décision de produit** visible par un candidat — un libellé
   d'interface non spécifié, une route qui n'existe pas, un parcours de
   navigation — qui n'est pas déjà tranchée dans `docs/`.
3. Une **contrainte annoncée devient impossible** à tenir. Tu ne la contournes
   jamais en silence, et tu n'inventes jamais de repli.
4. **Deux sources de vérité se contredisent.**
5. Il faut **installer une dépendance** absente du `package.json`.

Hors de ces cinq cas : agis, puis explique.

## Stack et arborescence

Nuxt 3 avec l'overlay `app/` (`future.compatibilityVersion: 4`) — le code
applicatif est sous `app/`, pas à la racine. i18n FR/AR en `strategy: 'prefix'` :
les liens d'e-mail en dépendent. Le relais vers Laravel passe par le BFF Nitro
(`server/routes/api/[...].ts`), authentification par cookies de session.

## CSS — la règle qui tient tout

`assets/css/tokens.css` est une **copie conforme** de
`docs/design/ui-v3/tokens-v3.css`. Elle doit le rester : le validateur de jetons
la lit en CI, et la reprise d'une révision du socle se fait par un simple `cp`.
**Aucune règle de composant n'y entre** — les classes partagées vont dans
`assets/css/commun.css`.

Piège documenté, à ne pas « corriger » : l'alias `--erreur` pointe vers
`--sys-err` (rouge système), pas vers la terre cuite.

L'opposition erreur système / erreur pédagogique **ne peut pas être portée par la
couleur** : sous deutéranopie, les aplats sont à ΔE 0,1 et les avant-plans à 4,7.
Elle se porte par la place, l'icône et les mots. `--peda-faux` rend 4,13:1 — pas
de texte courant.

## TypeScript

`npm run typecheck` doit être vert. **Jamais** `any`, `@ts-ignore`,
`@ts-expect-error`, ni d'assouplissement de la configuration. Ajouter des
déclarations de types manquantes n'est pas un assouplissement.

Pas d'annotation de type dans une expression de gabarit — le compilateur Vue les
refuse. La logique descend dans le `<script>`.

## Bilinguisme

- **Parité stricte `fr.json` / `ar.json`.** Aucune clé orpheline, dans un sens
  comme dans l'autre. `scripts/verifier-locales.mjs` le contrôle en CI.
- Aucun texte français laissé dans `ar.json`. En cas de doute sur un terme, tu
  traduis et tu listes le terme au rapport pour relecture.
- **Pas de HTML dans les messages i18n** — le compilateur le refuse, et c'est une
  surface d'injection. L'emphase passe par des créneaux de composant.
- Tout nombre dans du texte d'interface prend l'espace fine insécable
  (`&#8239;`) : sans elle, « 4 200 » se lit « 200 4 » en RTL.
- Toute chaîne venant de l'API porte `dir="auto"`.
- Aucun code d'énumération brut à l'écran — il se traduit.

## Contrat avec l'API

- **Un seul client : `useApi`.** Aucun composant n'appelle `$fetch` directement.
- `useAsyncData` place `undefined` dans `error`, pas `null`. Tester
  `error.value !== null` rend la condition toujours vraie et affiche le repli en
  permanence. Tester la véracité.
- **Aucun chiffre fabriqué.** Si l'API est illisible, la donnée disparaît — elle
  ne vaut pas zéro. « 0 filière » est une affirmation fausse ; l'absence ne dit
  rien.
- **Aucun repli en dur sur un marqueur contractuel.** La mention d'exemple vient
  de `meta.notice` ; si le serveur cesse de la servir, elle disparaît de l'écran.
- Le temps restant vient du serveur (`seconds_remaining`), jamais du client.

## Droits d'accès

**404 assumé, jamais 403.** Une ressource non autorisée n'existe pas — sans clin
d'œil du type « ou alors vous n'y avez pas droit », qui reconstituerait le 403 en
français.

**Le mur payant est un champ, pas une route.** Jamais de bouton désactivé ni de
lien masqué en CSS pour cause de droits : soit l'action est proposée, soit elle
n'existe pas dans le rendu.

## Outillage

- Préfère `git -C <chemin> <commande>` à `cd <chemin> && git <commande>`.
- `git add -A` emporte des fichiers non prévus. Ajoute par chemin explicite.
- Les scripts de mesure sont dans `docs/design/ui-v3/scripts/` :
  `auditer.mjs` (contraste, débordement, cibles tactiles, dans un vrai
  navigateur), `capturer.mjs`, `valider-palette.mjs`. Ils demandent Playwright et
  Chromium : `npm i -D playwright && npx playwright install chromium`.
- Une autre session peut travailler sur le dépôt backend en parallèle. Ne va
  jamais y vérifier quoi que ce soit sans y avoir été invité.
- Pour LIRE un fichier ou en extraire un passage : Read, grep -n -A/-B, head, tail — jamais sed pour lire. Le détecteur de sécurité de sed déclenche une demande d'approbation même sur un sed inoffensif, et chaque demande interrompt le travail.
