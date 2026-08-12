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

## FRONT-3 — chantier 1 (b) et chantier 2

## D-F11 — L'empêchement du D-F10 était faux : je n'étais pas allé à la source

**Ce que j'avais écrit.** « Les routes ne sont pas déclarées », d'après quinze
sondages HTTP.

**Ce qui était vrai.** Les routes existent, sous le préfixe `me/` :
`me/attempts`, `me/mastery`, `me/plan`, `me/diagnostics/{examCode}`. Je n'avais
pas ouvert `routes/api.php`, un fichier lisible dans un dépôt monté à côté.

**La règle qui en sort, et qui vaut pour la suite.** Une inférence n'est pas un
empêchement. Un empêchement est un fait vérifié à sa source. Quand la source
est hors d'atteinte, on écrit « je n'ai pas pu vérifier X » et on continue sur
ce qui n'en dépend pas — on n'arrête pas tout sur une déduction.

Appliqué immédiatement après : la banque de questions vide a été constatée par
`Question::count() = 0` en base, pas déduite d'un code d'erreur ; les deux
migrations en attente ont été lues avant d'en exécuter une.

## D-F12 — Banque de questions semée localement, hors dépôt

**Contexte.** `questions: 0` en base : aucun diagnostic ne pouvait s'ouvrir,
donc aucune recette de bout en bout.

**Décision.** 20 questions semées par un script de scratchpad exécuté via
`php artisan tinker`. Rien n'est écrit dans le dépôt backend.

**Justification.** Le script passe par `QuestionTransitionService`, donc par
`QuestionIntegrityChecker` : chaîne éditoriale complète (brouillon → à vérifier
→ relu → validé → publié), valideur distinct de l'auteur, quatre options,
distracteurs tous étiquetés d'une cause — sans quoi la publication pour
diagnostic est refusée, conformément à la fiche F03 v1.1. Une insertion directe
en base aurait contourné ces invariants et produit des données que le produit
n'accepte pas.

## D-F13 — Migration `000380` exécutée

**Constat.** `POST me/attempts/{uuid}/submit` répondait 500 :
`column "skipped_count" of relation "mastery_scores" does not exist`. Deux
migrations en attente, dont `000380_compter_les_questions_sautees` qui ajoute
cette colonne.

**Décision.** Exécutée, seule, par `--path`. `000390_ouvrir_la_session_de_revision`
est laissée en attente : elle relève de F07, chantier d'une autre session.

**Justification.** Additive, avec un `down()`, et sans elle la soumission d'un
diagnostic est impossible — donc l'arrêt B aussi. Lue avant exécution.

## D-F14 — Cookies relayés au rendu serveur

**Constat.** `useApi` posait `credentials: 'include'`, qui ne veut rien dire
côté serveur : aucune requête émise pendant le rendu ne portait la session.
`fetchMe` échouait, la garde de route concluait à l'absence de session, et toute
entrée directe sur une URL protégée rebondissait vers `/connexion`, qui
renvoyait le candidat authentifié vers `/app`.

**Ce que ça cassait.** Ouvrir une tentative par son adresse. Recharger la page
pendant une passation. C'est-à-dire exactement ce que « reprise sur un second
appareil » demande de faire.

**Décision.** `useRequestHeaders(['cookie'])` relayé dans les en-têtes, résolu
au moment de l'appel de `useApi()` — après le premier `await`, le contexte Nuxt
n'est plus actif et le composable lèverait.

## D-F15 — L'épreuve suivie vient d'une trace locale, faute de profil

**Contexte.** E1 doit afficher l'épreuve suivie et le dernier diagnostic. Le
contrat n'expose ni profil (PAS-5, à venir) ni index des tentatives — seulement
`GET me/attempts/{uuid}`, qui suppose de connaître l'identifiant.

**Décision.** `useSuivi` retient en local ce que le navigateur a fait, et
l'écran RECHARGE ensuite tout depuis l'API. La trace ne sert qu'à savoir quoi
demander ; aucun chiffre n'en sort. Sans trace, l'écran ne suppose rien : il
propose de choisir une épreuve.

**À remplacer** par le profil dès que PAS-5 l'expose.

## D-F16 — Deux serrures sur « la passation ne connaît jamais la correction »

**Décision.** La règle est tenue deux fois plutôt qu'une : les types de
`useTentative.ts` reproduisent la liste blanche d'`AttemptQuestionResource` (ni
`is_correct`, ni `rationale`, ni `cause`), et `data-zone="examen"` masque
justifications et autopsies au niveau du CSS, `!important` compris.

**Justification.** La première serrure tombe si un jour un composant reçoit une
justification par un autre chemin ; la seconde ne dépend d'aucun contrat. Une
règle qui ne doit pas céder mérite d'être tenue par deux mécanismes
indépendants.

**Vérifié sur le fil, pas dans le code** : `scripts/recette-passation.mjs`
enregistre les corps de toutes les réponses d'API. 30 appels pendant la
passation, 0 occurrence de `is_correct`, `rationale`, `cause` ni `explanation`.

## D-F17 — Trois rampes brutes de plus, révélées par la banque semée

**Constat.** Le bloc de démonstration ne s'était jamais affiché avec du contenu
réel : la banque était vide, l'API répondait `DEMO_NOT_AVAILABLE`. Dès qu'elle a
eu des questions, l'audit a relevé `p.preuve__contenu` à 1,07:1 en thème sombre
— `--texte` clair sur `--vert-50`, un fond invariant.

**Décision.** `--vert-50` → `--peda-juste-fond`, `--vert-700` → `--peda-juste`,
`--terre-700` → `--peda-faux-texte`, `--safran-50/800` → `--peda-remede-fond`
et `-texte`.

**Ce que ça confirme.** Un écran jamais rendu avec ses vraies données n'est pas
un écran vérifié. Trois défauts de contraste ont attendu que la banque existe
pour devenir visibles.

## FRONT-3 — chantier 3

## D-F18 — `--cookies` ajouté à `auditer.mjs` : D-F04 renversée, et pourquoi

**Ce que disait D-F04.** Ne pas modifier les scripts de
`docs/design/ui-v3/scripts/`, livrés par la conception : les patcher ferait
diverger le dépôt de sa référence.

**Ce qui a changé.** L'arrêt C exige l'audit des six écrans de la boucle. Ils
sont derrière une session ; `auditer.mjs` ne pose aucun cookie et les mesurerait
redirigés vers la connexion — six fois le même formulaire.

**Les deux options, et leur coût.** Réécrire la sonde dans la recette :
deux cents lignes de mesure dupliquées, qui divergeront au premier correctif
appliqué d'un seul côté. Ou ajouter une option de douze lignes au script.

**Décision.** `--cookies <fichier.json>`, plus `newContext` à la place de
`newPage` pour pouvoir les poser. Aucune règle de mesure n'est touchée.
**À remonter à la conception** pour reprise amont.

**Ce que ça dit de D-F04.** Elle n'était pas fausse — elle était juste pour son
périmètre. Une décision se réexamine quand ce qu'elle protégeait coûte plus que
ce qu'elle évite.

## D-F19 — La béquille de D-F15 retirée : l'index des tentatives existe

**Constat.** Pendant le chantier, la session backend a livré
`GET me/attempts` (commit « Index des tentatives : la reprise multi-appareil
cesse d'être une béquille »). Deux migrations manquaient encore —
`empreinte_d_idempotence` et `derniere_activite_de_la_tentative` — lues puis
exécutées, l'endpoint répond.

**Décision.** `useSuivi` supprimé, remplacé par `useParcours`. Le tableau de
bord demande au serveur ce que le candidat a fait.

**Pourquoi ça compte.** Une trace de navigateur ne suit pas le candidat d'un
appareil à l'autre : ouvrir le tableau de bord sur un téléphone après un
diagnostic passé sur un poste affichait un espace vide. Le nom du commit backend
dit la même chose que D-F15 : c'était une béquille.

## D-F20 — L'amorçage CSRF était hors de la gestion d'erreur

**Constat, par la recette.** Hors connexion, une réponse de passation
n'atteignait jamais la file d'envoi. `ensureCsrf()` était appelé AVANT le `try`
de `call()` : sa panne remontait en `FetchError` brute, pas en
`ApiRequestError`. L'appelant ne la reconnaissait pas et la relançait — le
travail du candidat était perdu, très exactement ce que la file existe pour
empêcher.

Le cas n'est pas rare : `csrfReady` est un drapeau de module, remis à zéro à
chaque rechargement. Recharger puis perdre le réseau suffit.

**Décision.** L'amorçage entre dans le `try` et sa panne se déclare
`NETWORK_ERROR` — ne pas pouvoir joindre le cookie CSRF, c'est ne pas pouvoir
joindre le serveur.

## D-F21 — Deux tests de recette étaient faux, et accusaient du code juste

**404 d'une tentative étrangère.** Le test refusait tout message contenant
« exist » — donc « Cette ressource n'existe pas », qui est la formulation
juste. Ce qu'il faut chercher est un AVEU D'EXISTENCE (« vous n'y avez pas
droit », « appartient à un autre compte ») qui reconstituerait un 403 en
français.

**Score nul.** Le test refusait « 0 % » n'importe où dans la page. Or un domaine
mesuré sur six réponses et raté six fois vaut bien 0 %, et le taire serait un
autre mensonge. La règle interdit de rendre un score ABSENT comme un zéro. Le
test compare désormais l'écran à la source : autant de pourcentages que de
scores non nuls, autant de phrases que de scores nuls, et aucun domaine ne
porte les deux.

**La leçon, symétrique de celle du D-F11.** Une recette qui échoue n'a pas
toujours raison. Elle est un artefact comme un autre, et son verdict se vérifie
à la source avant de corriger le code qu'elle accuse.

## D-F22 — Compteurs formulés sans accord de nombre

**Constat.** « 1 erreurs avec certitude », « Fondé sur 1 réponses » : faute de
français visible à l'écran.

**Décision.** Tournure « Libellé : {n} » — « Erreurs avec certitude : 3 ».

**Justification.** L'arabe compte six formes plurielles et vue-i18n ne les
tranche pas seul : une règle approximative produit une faute à chaque affichage.
La tournure neutre n'en produit aucune, dans les deux langues. Même choix qu'au
chantier 1 pour la file d'envoi.

## D-F23 — Règle 9bis tenue à deux endroits

**Décision.** `attempt.kind` est lu avant tout score, sur E1 (tableau de bord)
comme sur E4 (correction). Un résultat d'entraînement porte sa mention AVANT le
nombre, pas après.

**Justification.** Un avertissement placé sous le résultat arrive trop tard : le
nombre a déjà été lu comme une note. L'ordre est la moitié du message.

## FRONT-4 — E7, l'entraînement ciblé

## D-F24 — Les domaines proposés SONT les lignes de l'ordonnance

**Décision.** E7 n'appelle pas la maîtrise pour composer sa propre liste de
domaines : il affiche `GET me/plan`, dans l'ordre servi, avec le motif de chaque
ligne.

**Justification.** Recomposer une liste créerait un second classement, qui
finirait par diverger de celui de l'ordonnance — et le candidat verrait deux
priorités différentes pour la même épreuve. Afficher le motif à côté de chaque
domaine ferme aussi la boucle que le lot vise : l'ordonnance disait quoi
réviser, elle devient cliquable sans rien réinterpréter.

## D-F25 — `short_of_scope` transmis par l'URL, pas par un état partagé

**Contexte.** La règle 3 exige de montrer que la série est plus courte que
demandée. L'information vient du `meta` de l'ouverture (E7), l'écran qui doit
l'afficher est la passation (E3).

**Décision.** Trois paramètres d'URL — `demandees`, `servies`, `resservies`.

**Justification.** La passation est atteignable par son adresse et doit
survivre à un rechargement : c'est acquis depuis FRONT-3 et vérifié par la
reprise multi-appareil. Un état en mémoire disparaîtrait au premier F5, et le
candidat verrait six questions sans savoir qu'il en avait demandé quinze —
exactement ce que la règle interdit. L'URL, elle, se recharge et se partage.

**Corollaire.** Le bandeau paraît AVANT la première question. Une série plus
courte qu'annoncée se lit autrement si on l'apprend à la fin.

## D-F26 — La clé d'idempotence est portée par une PORTÉE, pas par l'épreuve

**Constat.** `cleIdempotence(codeEpreuve)` aurait donné la même clé au
diagnostic et à l'entraînement de la même épreuve. Le backend refuse désormais
ce rejeu (empreinte d'idempotence, migration `000400`), mais le refus serait
survenu à l'usage plutôt qu'à la conception.

**Décision.** La portée devient `entrainement.{épreuve}.{domaine ou 'auto'}` —
deux domaines visés sont deux intentions distinctes, et méritent deux clés.

## D-F27 — `dir="auto"` marqué par `data-domaine`

**Constat, par la recette.** Le contrôle « toute chaîne d'API porte
`dir="auto"` » signalait un manquant sur E7. Vérifié : c'était « Laisser Naja7i
choisir », une chaîne TRADUITE, déjà dans la langue de la page. Les dix noms de
domaine servis par l'API le portaient tous.

**Décision.** Les choix dont le libellé vient de l'API portent `data-domaine`.
La recette ne contrôle qu'eux, et vérifie en plus qu'il y en a — un test qui
passe sur zéro élément ne prouve rien.

**Encore la même leçon.** Troisième fois qu'un test accuse du code juste
(cf. D-F21). Le réflexe est acquis : vérifier ce que la recette mesure avant de
corriger ce qu'elle désigne.

## D-F28 — `.champ__aide` était inline

**Constat.** Le premier champ étroit du produit — le nombre de questions — a
collé son aide « 5 – 40 » contre la saisie. `.champ__aide` est un `<span>` sans
`display: block` ; tant que les champs occupaient toute la largeur, il passait à
la ligne de lui-même et l'omission ne se voyait pas.

**Décision.** `display: block` dans `commun.css`. Vu sur capture, pas déduit.

## FRONT-4 — E8, miroir, tableau de bord

## D-F29 — `/app/revisions` résout l'épreuve, elle ne la porte pas

**Contexte.** Les routes mémoire sont par épreuve (`me/memory/{examCode}/due`),
mais la révision est une porte QUOTIDIENNE : le candidat y va le matin, il ne
choisit pas une épreuve avant de savoir s'il a quelque chose à faire.

**Décision.** `/app/revisions` sans paramètre. L'épreuve est résolue par l'index
des tentatives — la même source que le tableau de bord — et `?epreuve=CODE`
reste accepté pour qui en suit plusieurs.

**Justification.** Mettre l'épreuve dans le chemin aurait obligé à la choisir
avant de savoir s'il y a lieu. La réponse « rien aujourd'hui » ne vaut pas un
détour par un sélecteur.

## D-F30 — La clé d'idempotence de la séance est datée, pas aléatoire

**Décision.** `revision.{épreuve}.{AAAA-MM-JJ}`.

**Justification.** Le rendez-vous mémoire est quotidien : deux clics à dix
minutes d'écart visent la MÊME séance. Une clé aléatoire par visite en ouvrirait
deux, et la seconde viderait le calendrier de la première. La date est celle du
poste — le serveur reste seul juge de ce qui est échu, la clé ne sert qu'à ne
pas redemander deux fois la même chose.

## D-F31 — `MIRROR_ALREADY_OPEN` mène au miroir, il ne l'annonce pas indisponible

**Constat, à l'exécution.** Un quatrième code de refus existe, que je ne
traitais pas : `MIRROR_ALREADY_OPEN`. Mon premier filet attrapait tout
`MIRROR_*` et affichait « aucune autre question ne tend ce piège » — ce qui est
FAUX dans ce cas, et laisse le candidat sans moyen de retrouver la série ouverte
à son nom.

**Décision.** Le refus porte `details.attempt_uuid` : on y navigue. Les deux
autres (`MIRROR_NOT_AVAILABLE`, `MIRROR_NOT_APPLICABLE`) gardent le message
d'indisponibilité.

**La leçon.** Un filet qui attrape une famille entière de codes traite le cas
qu'on n'a pas lu comme celui qu'on a lu. Ici, trois refus se ressemblent et
n'appellent pas la même conduite — le backend le dit d'ailleurs en toutes
lettres dans ses propres commentaires.

## D-F32 — Un 429 n'est pas un résultat de recette

**Constat.** Le contrôle « la séance s'ouvre » est passé au vert sur un
**429 de limitation de débit** provoqué par la recette elle-même
(`throttle:10,1`). Le test cherchait « un message est affiché » : il en a trouvé
un, et n'a rien prouvé.

**Décision.** Un 429 déclenche une attente de la fenêtre puis une reprise ; s'il
persiste, seul un refus RECONNAISSABLE (« à jour », « banque ») vaut succès.

**Pourquoi c'est consigné.** C'est le défaut symétrique de D-F21 : là une
recette accusait du code juste, ici elle absolvait du code non vérifié. Les deux
viennent de tests qui mesurent la présence d'un signe plutôt que sa nature.

## D-F33 — Deux issues légitimes pour l'ouverture d'une séance

**Décision.** La recette accepte l'ouverture ET le refus annoncé sans
navigation.

**Justification.** « Rien d'échu » est le cas le plus fréquent une fois la
boucle installée : un candidat à jour est un candidat qui va bien. Exiger la
navigation ferait échouer la recette sur le comportement nominal du produit.

## D-F34 — Les rendez-vous de recette sont antidatés localement

**Décision.** `review_schedules.due_on` reculé d'un jour, et neuf lignes ajoutées
pour dépasser le plafond de vingt. Hors dépôt, par `tinker`.

**Justification.** Le plafond ne se vérifie qu'au-delà de vingt échus, et le
calendrier réel met des semaines à en produire autant. Mesuré :
26 échus → 20 servis, 6 annoncés en attente.

## FRONT-4 — les deux bloquants de l'audit tournée 2

## D-F35 — La conséquence du BLOC-5, mesurée avant correction

**Ce qui était écrit.** Un 422, 409 ou 404 retirait l'entrée de la file, au
motif que « l'appelant a déjà reçu l'erreur ». C'est faux pour une entrée créée
HORS CONNEXION : son premier échange avec le serveur a lieu dans `ecouler()`.
Personne n'avait donc jamais vu cette erreur.

**Mesure, sur une vraie série, avant de toucher au code.** Ouverture d'un
diagnostic à cinq questions, quatre réponses envoyées, une jetée comme le
faisait le client, puis soumission :

| | avant | après |
|---|---|---|
| `skipped_count` cumulé sur l'épreuve | 0 | **1** |

Le compteur nourrit `RemediationPlanner` (`$partSautee`), qui remonte le domaine
et bascule son motif vers `questions_sautees` quand la part sautée dépasse la
part mesurée. Le candidat avait répondu ; le produit lui reproche une esquive.

**Décision.** Trois états — `envoye`, `a_reessayer`, `refuse`. **Seul un 2xx
retire une entrée.** Un refus reste dans une boîte d'échec explicite, bloque la
soumission, et se présente avec l'item concerné. La seule suppression d'une
entrée non envoyée passe par un geste humain (`acquitterRefus`).

## D-F36 — Enveloppe de file : propriétaire, version, entrées

**Décision.** `{ownerUserUuid, version, entries}` à la place du tableau nu.
`ecouler()` refuse d'émettre quand le propriétaire n'est pas l'utilisateur
connecté, et l'écran propose de reconnecter le compte propriétaire.

**Justification.** La file ne portait aucune identité. Une reconnexion sous un
autre compte l'écoulait : les réponses partaient sous la mauvaise identité,
recevaient 404, et le chemin du BLOC-5 les supprimait. Deux défauts se
composaient pour effacer le travail d'un candidat au profit d'un autre.

**Migration.** Une file v1 (tableau nu) est relue avec `ownerUserUuid: null` et
ADOPTÉE par le premier utilisateur identifié, plutôt que jetée : un candidat en
passation au moment du déploiement ne perd rien.

## D-F37 — Verrou inter-onglets, et relecture DANS le verrou

**Décision.** Toute mutation passe par `avecVerrou` — Web Locks quand il existe,
sinon un mutex de page — et **relit le stockage à l'intérieur du verrou**.

**Justification.** Le défaut n'était pas l'absence de verrou seule : c'était le
cycle « lire en mémoire, muter, réécrire tout le tableau ». Un onglet écrasait
ce qu'un autre venait de poser. Relire dans le verrou fait du stockage la source
de vérité ; l'identifiant stable par entrée (le chemin de la ressource) rend la
fusion déterministe quand Web Locks n'est pas disponible.

## D-F38 — Le contrôle de non-fuite passe du typage au HTML servi

**Constat de l'audit.** Le contrôle reposait sur les types, qui ne retirent
aucun champ à l'exécution. Si le backend régressait, les types deviendraient
rouges à la compilation SUIVANTE — mais le HTML servi contiendrait déjà la
correction.

**Décision.** La recette lit la charge utile HYDRATÉE d'une passation, sous
session, et y cherche `is_correct`, `rationale`, `cause`, `explanation`.
Mesuré : 15 ko de HTML authentifié, aucune occurrence.

## D-F39 — Trois tests de recette faux, corrigés avant le code

Aucun des trois échecs BLOC-4 du premier passage ne venait du code :

1. Les deux onglets visaient le MÊME item : le dédoublonnage par chemin les
   fondait, à juste titre. Le test vise maintenant deux items distincts, et
   vérifie ce qui compte — que l'écriture d'un onglet ne fasse pas disparaître
   celle de l'autre.
2. Le réseau était rétabli AVANT le changement de compte : la file partait sous
   A, correctement. La file est désormais posée une fois la session close.
3. L'écouteur de requêtes était attaché avant la déconnexion, et comptait au
   débit de B un PUT émis sous A.

**Quatrième occurrence du même piège** (D-F21, D-F27, D-F32). La règle est
maintenant systématique : quand une recette échoue, on vérifie ce qu'elle mesure
avant de corriger ce qu'elle désigne.
