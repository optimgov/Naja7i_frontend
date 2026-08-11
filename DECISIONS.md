# DECISIONS — choix pris en autonomie par Claude Code

Journal des décisions prises sans arbitrage préalable d'OptimGov. Même règle que
dans le dépôt `Naja7i_backend_front` : à chaque choix, retenir l'option qui
respecte le plus fidèlement les instructions du lot, les fiches de règle et les
ADR. Ce journal ne fait pas autorité — il trace ce qui a été décidé faute
d'arbitrage, pour que ce soit revu.

## D-F01 — `package-lock.json` laissé en l'état : la réécriture n'a rien réécrit

**Contexte.** La consigne demandait de restaurer le lock de `main` et de n'y
rajouter que l'entrée `@types/node`, au motif qu'une renormalisation par un
autre npm peut déplacer des versions résolues dans tout l'arbre — et que la CI
installe depuis ce fichier avec `npm ci`. Le `git diff --stat` affichait en
effet +5024 / −6093 sur `ce3bd99`.

**Ce que la mesure montre.** Comparaison des deux locks entrée par entrée, puis
après tri des clés et retrait des entrées `extraneous` :

| Mesure | Résultat |
|---|---|
| Versions résolues différentes | **0** sur 929 entrées communes |
| Entrées communes différant par un champ | **0** |
| Séquence des clés | **identique** |
| Entrées ajoutées | 2 — `@types/node@26.2.0` et sa dépendance `undici-types@8.3.0` |
| Entrées retirées | 60 — **toutes** marquées `"extraneous": true` |

Le diff canonique complet tient en trois blocs : la déclaration
`@types/node` dans `devDependencies`, son entrée de paquet, celle
d'`undici-types`. Rien d'autre.

**Décision.** Ne pas restaurer. Le lock de `front-2` est déjà exactement « le
lock de `main`, plus `@types/node` ».

**Justification.** Les +5024 / −6093 sont un artefact d'alignement de lignes de
`git diff` : 60 blocs JSON supprimés en des points dispersés d'un fichier de
14 694 lignes dont tous les blocs se ressemblent, et `git` réapparie mal. Le
solde net est de −1069 lignes, ce qui correspond aux 60 entrées retirées moins
les 2 ajoutées. Le risque redouté — un déplacement de versions résolues — ne
s'est pas produit : il est mesuré à zéro.

Restaurer aurait réintroduit les 60 entrées `extraneous`. Une entrée
`extraneous` désigne un paquet présent dans `node_modules` mais qu'aucune
dépendance ne réclame ; elle est écrite quand le lock est régénéré depuis un
`node_modules` pollué. C'est un défaut du lock de `main`, que `ce3bd99` a
corrigé au passage. La restauration aurait donc dégradé le fichier au nom de sa
protection.

**Vérification.** `npm ci` depuis le lock commité : 733 paquets, 0 vulnérabilité,
lock inchangé après coup (`npm ci` n'écrit jamais le lock).

## D-F02 — Node épinglé à 24.18.0, et une seule fois

**Contexte.** La consigne demandait un `.nvmrc` et la même version dans
`actions/setup-node`, en prenant la version qui a produit le lock d'origine —
vérifiée, pas supposée.

**Ce qui est vérifiable, et ce qui ne l'est pas.** Un `package-lock.json`
n'enregistre pas le Node ni le npm qui l'a produit. `lockfileVersion: 3` couvre
npm 7 à 11 : le fichier ne peut pas répondre à la question directement. Les
éléments réellement constatés :

- La machine n'a qu'un seul Node, `/usr/local/bin/node` en v24.18.0
  (npm 11.16.0), sans `nvm` ni version Homebrew concurrente.
- L'horodatage du binaire est du 23 juin 2026 et n'a pas bougé depuis — donc ce
  Node était déjà en place le 8 août, date du lock d'origine (`43a140f`), et
  aucun autre ne l'a remplacé depuis.
- Les 60 entrées `extraneous` du lock de `main` ne peuvent être écrites que par
  un npm exécuté contre un `node_modules` réel : le lock a été produit sur une
  machine, pas livré propre depuis une archive.

**Décision.** `.nvmrc` à `24.18.0`. La CI passe de `node-version: '20'` à
`node-version-file: '.nvmrc'`.

**Justification du choix de 24 plutôt que 20.** C'est la version qui a produit
le lock ; l'écart réel était que la CI installait sous Node 20 (npm 10) un
fichier écrit par npm 11. Aligner la CI sur le poste supprime cet écart dans le
sens où le lock reste la référence. Aligner le poste sur 20 aurait imposé de
régénérer le lock — c'est-à-dire exactement la réécriture que la consigne
cherche à éviter.

**Justification de `node-version-file`.** La consigne demandait « la même
version » aux deux endroits. Le fichier référencé la garantit identique par
construction, là où deux chaînes recopiées finissent par diverger — et c'est
cette divergence qui produit la situation qu'on corrige ici.

**Point de vigilance.** npm 11 n'exécute plus les scripts d'installation sans
autorisation explicite (`allow-scripts`), ce que npm 10 faisait. Quatre paquets
sont concernés, dont `esbuild`. Le `build` complet passe sans eux en local, les
binaires de plateforme étant installés comme paquets à part entière ; à
surveiller au premier passage de la CI sous Linux.

## D-F03 — Les trois scripts de `docs/design/ui-v3/scripts/` restent hors CI

**Décision.** `auditer.mjs`, `capturer.mjs` et `valider-palette.mjs` restent
versionnés (ils le sont depuis `d088e71`) et ne sont branchés dans aucune étape
de `ci.yml`. Aucune modification n'a été faite.

**Justification.** `auditer.mjs` exige Playwright et un serveur en cours
d'exécution : le brancher maintenant rendrait la CI rouge pour une raison
étrangère au code livré. C'est le premier chantier du lot suivant.

## FRONT-3 — chantiers 0 et 1

## D-F04 — Une enveloppe d'audit, plutôt qu'une modification d'`auditer.mjs`

**Contexte.** `auditer.mjs` prend UNE cible et décline ses variantes par
fragment d'URL (`--hash`). L'application a de vraies routes. Son binaire par
défaut, `/opt/pw-browsers/chromium`, est un chemin d'image de conteneur absent
de tout poste.

**Décision.** `scripts/auditer-ecrans.mjs` : tient la liste des écrans, résout
le Chromium réellement installé par Playwright, appelle le script du socle sans
le modifier. `npm run audit`.

**Justification.** Les scripts de `docs/design/ui-v3/scripts/` sont livrés par
la conception. Les patcher ferait diverger le dépôt de sa référence et rendrait
la prochaine reprise conflictuelle. L'enveloppe est du code applicatif, elle
vit avec l'application.

**Corollaire.** Le RTL ne se déclenche pas par un bouton mais par le préfixe de
langue : une URL arabe EST la variante RTL. `--rtl` reste inutilisé.

## D-F05 — SEP-01 retirée : elle mesurait la mauvaise chose

**Contexte.** Le point (h) demandait de réconcilier `jetons.config.json` avec la
mesure sous dichromatie.

**Mesure.** Avec `valider-palette.mjs` (Viénot-Brettel-Mollon puis OKLab) :

| Paire | clair | sombre |
|---|---|---|
| `--sys-err` ↔ `--peda-faux` | ΔE 4,7 deutan · 10,1 normal | **ΔE 1,7** deutan · 4,6 normal |
| aplats | ΔE 0,1 | ΔE 0,4 |

Le plancher est à 6 en dichromatie, et à 15 en vision normale. Aucune des quatre
mesures ne le tient.

**Pourquoi SEP-01 passait quand même.** La règle `separations` du validateur
calcule une distance euclidienne en sRGB brut, **en vision normale**, sans
jamais appliquer ses matrices de dichromatie — elles ne servent qu'aux `series`.
D'où le « 56 » rassurant du document v3. La règle délivrait un certificat de
conformité à un défaut.

**Décision.** `separations` vidée. À la place, quatorze règles de contraste qui
contrôlent ce qui est vrai : quels jetons ont le droit de porter du texte
(CTR-05 à 08) et lesquels sont réservés aux aplats (NTX-04 à 06), dans les deux
thèmes. Et un second passage du validateur,
`jetons.commun.config.json`, sur `assets/css/commun.css` : RED-01 à 03 exigent
que l'erreur système, l'erreur de saisie et le succès portent un signe ;
SEP-03 et SEP-04 interdisent d'employer un jeton d'aplat comme couleur de texte.

**Vérifié par sonde.** SEP-04 a d'abord signalé `border-color: var(--sys-err)` —
un faux positif : le motif attrapait toute propriété finissant par `color`.
Corrigé par une amorce `(?:^|[\s;{])`, puis reconfirmé mordant en injectant une
vraie violation dans une copie du fichier. Une règle qu'on désactive au premier
faux positif ne protège plus rien (cf. DET-18 côté backend).

## D-F06 — Le thème par cookie, lu au rendu serveur

**Décision.** `useTheme` sur `useCookie`, `data-theme` posé par `app.vue` seul.
Pas de `prefers-color-scheme`.

**Justification.** `localStorage` n'existe pas au rendu serveur : la page
partirait en clair puis basculerait, à chaque entrée. Le cookie est lu par le
serveur, l'attribut part dans le HTML. **Vérifié** : `curl -H 'Cookie:
naja7i_theme=sombre'` rend `<html lang="fr" data-theme="sombre" dir="ltr">`.
Le non-clignotement n'est pas une intention, c'est une propriété du rendu.

Pas de suivi automatique de la préférence système : le socle v3 l'écrit
au-dessus de son bloc sombre — « choisi pas à pas, jamais une inversion
automatique ».

## D-F07 — Rampes brutes remplacées par les rôles

**Constat.** La zone publique de FRONT-2 employait `--sable-0/50/100/200/300` et
`--encre-700` pour ses surfaces, bordures et textes secondaires. Le thème sombre
ne redéfinit que les **rôles** ; la rampe est invariante par construction. Au
premier essai du sombre, les fonds restaient clairs pendant que les textes
passaient au clair : titres illisibles sur toute la page d'accueil.

**Décision.** Substitution par les rôles. Cinq des six correspondances sont
l'identité en thème clair — `--surface` EST `--sable-0` — donc l'apparence
claire ne bouge pas. La sixième, `--sable-300` → `--bordure-forte`, fonce d'un
cran : c'est le rôle qui porte l'intention, et il est mesuré en sombre.

`LogoNaja7i.vue` est exclu : sa tuile est un dessin de marque, pas une surface.

## D-F08 — Deux rôles manquants au socle, définis dans `commun.css`

**`--texte-sur-accent`.** Le socle définit `--accent`, `--accent-fort`,
`--accent-doux`, mais aucun rôle pour le texte posé DESSUS. `.btn` emploie donc
`--texte-inverse` : correct en clair (sable sur vert profond), faux en sombre,
où l'accent devient un menthe clair. **Tous** les boutons principaux rendaient
2,11:1. Mesuré par `auditer.mjs` sur les six écrans, en thème sombre.

**`--marque-accent`.** Même piège, symétrique, sur le 7 de la marque :
`--safran-800` rend 6,78:1 en clair et 2,55:1 en sombre ; `--safran-500`
l'inverse. Une valeur ne peut pas tenir les deux thèmes.

**Décision.** Les deux rôles sont définis dans `commun.css`, jamais dans
`tokens.css` — copie conforme du socle, qui ne doit pas diverger. **À remonter à
la conception** pour reprise dans `tokens-v3.css`.

**Ce que ça dit de la méthode.** Aucune de ces deux fautes n'est visible en
relecture : chaque jeton est correct isolément, c'est leur composition dans un
thème qui ne l'est pas. Elles ne sortent qu'en mesurant un rendu réel.

## D-F09 — L'audit en CI ne couvre que les écrans indépendants de l'API

**Décision.** `npm run audit:ci` — six écrans (les cinq d'authentification et la
page d'erreur), en FR et AR, clair et sombre. Les cinq écrans de catalogue en
sont exclus.

**Justification.** Ils affichent des données servies par Laravel. La CI du
frontend n'a pas de backend : les y auditer mesurerait leur état vide, pas leur
rendu. Le script **écrit lui-même la liste de ce qu'il n'a pas couvert** dans
son rapport — une couverture réduite qu'on tait se lit comme une couverture
complète.

## D-F10 — BLOQUANT : les composables du point (b) ne sont pas écrits

**Ce qui est demandé.** `useTentative`, `useMaitrise`, `useOrdonnance`, contre un
backend qui « sert déjà diagnostic, passation, soumission, correction, maîtrise
et ordonnance ».

**Ce qui est mesuré.** L'API qui tourne — `php -S 127.0.0.1:8000` sur
`Naja7i_backend_front`, démarrée ce matin — ne sert aucune de ces routes.
Sondées sous une quinzaine de formes (`/attempts`, `/diagnostics`,
`/diagnostic`, `/tentatives`, `/mastery`, `/maitrise`, `/ordonnance`,
`/remediation/plan`, en GET et en POST) : toutes répondent le MÊME corps qu'un
chemin inventé —

    {"error":{"code":"RESOURCE_NOT_FOUND", …}}

identique à la réponse de `/api/v1/inexistant-xyz`. Ce n'est donc pas un 405 ni
un 401 : les routes ne sont pas déclarées. Répondent : `/api/v1/me` (401),
`/api/v1/catalogue` (200), `/api/v1/demonstration/correction` (404 applicatif
`DEMO_NOT_AVAILABLE`, documenté), `/api/v1/auth/*`.

**Décision.** Ne rien écrire. Deviner des chemins d'API reviendrait à écrire
contre des données inventées — ce que la consigne interdit explicitement pour
F05 et F07, et pour la même raison ici : le code compilerait, les écrans se
peindraient, et rien ne fonctionnerait.

**Ce que ça bloque.** Le point (b) du chantier 1, et par conséquent les
chantiers 2 et 3 en entier. Tout le reste du chantier 1 est livré.

**Ce qu'il faut pour débloquer.** Soit le contrat des endpoints (chemins, formes
de réponse), soit un backend qui les serve — les deux hypothèses tenables étant
un cache de routes à vider ou une branche backend non fusionnée.
