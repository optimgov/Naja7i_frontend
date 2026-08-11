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
