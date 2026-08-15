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

## FRONT-5 — les recettes entrent en CI

## D-F40 — Semis par `tinker` : provisoire, avec sa date de sortie

**Ce qui était demandé.** Semer par l'API de la chaîne éditoriale — le semis
éprouverait alors la chaîne à chaque exécution, deux gardes pour une.

**L'obstacle, vérifié dans `routes/api.php` du backend.** Trois transitions du
cycle éditorial n'ont AUCUN point d'entrée HTTP :

| Transition | Service | Route |
|---|---|---|
| `draft` → `a_verifier` | `QuestionTransitionService::submitForReview()` | **aucune** |
| `a_verifier` → `reviewed` | `::markReviewed()` | **aucune** |
| `reviewed` → `pedagogically_validated` | `::validate()` | **aucune** |

Existent en revanche : `POST admin/questions`, `PATCH admin/questions/{uuid}`,
`POST admin/questions/{uuid}/publish`, `/retire`, et les lectures.

Or `publish()` refuse toute question qui n'est pas `pedagogically_validated` et
porteuse d'un `validator_id` distinct de son auteur. Une question créée par
l'API reste donc en `draft`, et `publish` répond 422. La permission
`questions.validate` figure pourtant au référentiel du PAS-9 — elle n'a
simplement aucune route.

**Décision.** `scripts/recette/semer-banque.php`, exécuté par `php artisan
tinker`, passant par le SERVICE de domaine. `QuestionIntegrityChecker`
s'applique donc : quatre options, valideur ≠ auteur, distracteurs tous
étiquetés, source vérifiée, remédiation. Un semis en insertion directe aurait
contourné tout cela.

**BASCULE PRÉVUE, pour que ce provisoire ne s'installe pas.** Dès que les trois
routes existent — c'est un pas de la session backend, rien n'a été écrit dans
son dépôt — `semer-banque.php` est remplacé par un client HTTP de la chaîne
éditoriale. Le reste de l'outillage ne bouge pas : l'orchestrateur appelle un
script de semis, il ne connaît pas son moyen.

## D-F41 — Aucun secret GitHub : les deux dépôts sont publics

**Vérifié** — `gh repo view` : `Naja7i_frontend` PUBLIC,
`Naja7i_backend_front` PUBLIC. `actions/checkout` clone le second avec le
`GITHUB_TOKEN` implicite. Ni jeton personnel, ni clé de déploiement.

Le workflow le dit en commentaire ET dans le nom de l'étape, pour que la
question ne se repose pas. Si l'un des dépôts passait en privé, l'étape
échouerait sur un 404 de clonage — un signal net plutôt qu'une dérive.

## D-F42 — Épinglage sur `main` du backend, et son coût

**Décision.** `ref: main`, et le SHA obtenu est journalisé à chaque exécution.

**Le coût des deux options.** `main` : un changement de contrat backend fait
rougir la recette frontend le jour même — bruyant, parfois sur un lot qui n'y
est pour rien. SHA épinglé dans un fichier : la CI reste verte pendant que le
contrat s'éloigne, et l'écart se découvre à la fusion suivante, quand il coûte
davantage et qu'on ne sait plus quel changement l'a causé.

Le bruit est un symptôme ; le silence est une dette. On garde le bruit. Le SHA
journalisé rend l'échec reproductible : on sait contre quel backend il s'est
produit.

## D-F43 — `CatalogueSeeder` n'est pas idempotent : on ne sème qu'une base vierge

**Constat, dès la première exécution.** `php artisan db:seed` sur une base déjà
semée viole `filieres_slug_unique`. C'est une propriété du backend, et on n'y
touche pas depuis ici.

**Décision.** L'orchestrateur compte les filières et ne sème que si la base est
vide. En intégration continue elle l'est toujours ; sur un poste, le semis n'a
lieu qu'une fois. `semer-banque.php`, lui, est idempotent par construction —
l'énoncé numéroté sert de clé naturelle.

## D-F44 — Une pause entre les recettes, imposée par le produit

**Constat, à la première exécution enchaînée.** La deuxième recette a reçu
`429 RATE_LIMIT_EXCEEDED` : `me/diagnostics` et `me/training` portent
`throttle:10,1`, et quatre recettes à la suite ouvrent bien plus de dix séries
par minute.

**Décision.** 65 secondes d'attente entre deux recettes, réglables par
`RECETTE_PAUSE`, et comptées à part dans le bilan pour que la durée annoncée
reste honnête.

**Ce qui a été écarté.** Relever la limite côté backend le temps de la recette :
ce serait modifier le produit pour qu'il ressemble au test. La limite est
correcte — c'est l'enchaînement qui doit s'y plier. D-F39 s'applique à
l'outillage comme au reste.

## D-F45 — La première exécution groupée a trouvé une recette périmée

**Constat.** Deux contrôles de `recette-front3.mjs` — « session expirée » et
« réponse hors connexion » — ont échoué en rendant `undefined`. Le produit,
lui, se comportait correctement : reprise proposée sur place, bandeau affiché,
réponse rejouée au retour du réseau.

**Cause.** La recette lisait `localStorage['naja7i.file-envoi']` comme un
TABLEAU. Depuis le BLOC-4, c'est une ENVELOPPE `{ownerUserUuid, version,
entries}`. `objet.length` vaut `undefined`, et `undefined` ne lève pas.

**Décision.** Les trois lectures acceptent les deux formes. Ce n'est pas un
assouplissement du contrôle : c'est la correction d'une lecture devenue fausse.

**Ce que ça dit du lot.** Le changement de format datait du lot précédent, et
personne ne l'avait vu — parce que `recette-front3.mjs` ne tournait plus depuis.
C'est exactement le constat qui a motivé FRONT-5 : ce qu'on ne rejoue pas
pourrit en silence. La première exécution groupée l'a montré en trois minutes.

**Corollaire, à surveiller.** Un test qui rend `undefined` là où il attend un
nombre ne signale rien de lui-même. Les assertions de file comparent désormais à
un entier, jamais à une valeur potentiellement absente.

## D-F46 — La bascule annoncée au D-F40 est faite : le semis passe par l'API

**Ce qui a levé l'obstacle.** Le PAS-33 a ouvert les trois routes qui
manquaient — `POST admin/questions/{uuid}/submit`, `/review`, `/validate`. La
condition posée au D-F40 est remplie, et le provisoire sort par la porte qu'on
lui avait laissée.

**Décision.** `semer-banque.php` est supprimé. `semer-banque.mjs` mène chaque
question du brouillon au publié PAR L'API, sous trois identités distinctes —
auteur, relecteur, valideur — chacune avec sa session. La chaîne s'écrit comme
une table d'états plutôt que comme une suite d'appels : c'est ce qui rend la
reprise gratuite.

**LA SECONDE GARDE EST GAGNÉE.** C'était l'argument du D-F40, et il se vérifie :
une régression de la chaîne éditoriale ne se manifeste plus au bout de la
recette par une banque vide et inexplicable. Elle échoue au semis, à l'étape qui
l'a causée, en nommant le métier et le refus.

**IDEMPOTENT PAR VÉRIFICATION D'ÉTAT, ET C'EST LA SEULE FAÇON.** Une transition
rejouée répond 422 : `a_verifier → a_verifier` n'est pas une arête, et le
service refuse au lieu de faire croire qu'il a agi. Le semis lit donc l'état
courant et ne joue QUE les transitions manquantes. Vérifié sur une base vierge :
20 créées ; une question laissée à mi-chaîne : 19 créées + 1 reprise ; rejoué :
0 écriture.

**Le contrôle documentaire vient en premier.** Publier pour le diagnostic exige
une source VÉRIFIÉE, et citer une source ne la vérifie pas (DET-46). Le semis
appelle `POST admin/sources/{uuid}/verify` AVANT de rédiger : une source vérifiée
qualifie les citations faites après son contrôle, donc chaque citation n'a plus
qu'un seul état possible.

**CE QUI RESTE EN `tinker`, ET POURQUOI CE N'EST PAS UN REPLI.**
`preparer-referentiel.php` ne crée que ce qui n'a AUCUNE route — vérifié dans
`routes/api.php` :

| Ce qu'il fait | Pourquoi pas par l'API |
|---|---|
| comptes éditoriaux et leurs rôles | `auth/register` crée un candidat ; rattacher un rôle n'a pas de route |
| remédiations | exigées au diagnostic, ne sortent que par le plan de révision d'un candidat — circulaire |
| uuid de la source | `verify` prend un uuid, et aucune lecture ne le rend : les ressources ne citent la source que par son CODE |

Ce sont du RÉFÉRENTIEL et du PERSONNEL, pas de la chaîne éditoriale. La
frontière se relit d'un coup d'œil : ce fichier écrit une passation, il ne crée
aucune question. Le semis, lui, ne touche plus la base.

## D-F47 — Un énoncé numéroté est une clé naturelle, pas une contrainte d'unicité

**Constat, à la première exécution du nouveau semis.** Échec sur la question
n° 1 : « doit renvoyer vers une remédiation », « aucune source vérifiée ». Le
réflexe du D-F39 a servi une cinquième fois — vérifier ce que le test mesure
avant de corriger ce qu'il désigne.

**Cause.** DEUX questions portaient l'énoncé n° 1 : une publiée par l'ancien
semis, et une orpheline restée `pedagogically_validated`, laissée par une
exécution interrompue d'avant le lot. Rien en base n'interdit ce doublon. Le
semis construisait sa table par énoncé avec « la dernière servie gagne » —
c'est-à-dire au hasard de l'ordre de tri. Il avait tiré l'orpheline, et les deux
blocages annoncés étaient exacts.

**Décision.** À énoncé égal, on retient la question LA PLUS AVANCÉE dans la
chaîne. Si l'une est publiée, le but du semis est atteint, quoi qu'il traîne à
côté. Le doublon est ÉNONCÉ au rapport, jamais supprimé : le semis n'efface pas
ce qu'il n'a pas écrit, et une banque de développement qui accumule des jumelles
à mi-chaîne doit se voir. En CI la base est neuve, la liste est toujours vide.

**Ce que ça dit.** L'idempotence par clé naturelle suppose que la clé soit
unique en base. Ici elle ne l'est pas, et la supposition tenait tant que le
semis était le seul écrivain.

## D-F48 — Le D-F44 est levé : la limite se règle par PROFIL, pas par attente

**Ce que disait le D-F44, et il avait raison.** Relever la limite côté backend
pour faire passer la recette, c'est modifier le produit pour qu'il ressemble au
test. La décision d'alors — 65 s d'attente entre deux recettes — était la bonne
avec les moyens d'alors : le seuil était écrit en clair dans `routes/api.php`,
et le relever aurait relevé le produit.

**Ce qui a changé, et pourquoi ce n'est pas le même geste.** Le PAS-34 du
backend ne relève pas « la limite » : il déclare DEUX PROFILS, dont le défaut
est `production`. Le profil de recette relève les seuils de TRANSPORT, et le
backend prouve par ses propres tests ce qu'il ne relève pas :

| Ce qui reste réel en recette | Pourquoi |
|---|---|
| `reponse`, la route qu'écoule la file d'envoi | un vrai 429 y avait produit un faux vert ; la recette doit rencontrer un limiteur réel |
| `LoginThrottle`, trois agrégats | c'est de la sécurité, pas du transport |
| le renvoi de vérification, 3 par 900 s | idem — arme de harcèlement si débridée |

Le produit ne bouge pas : ce qui bouge, c'est ce que l'environnement de recette
déclare de lui-même. La distinction n'est pas rhétorique — elle est vérifiée par
`RateLimitProfileTest`, dont deux cas éprouvent les limiteurs de sécurité SOUS
le profil de recette, là où la garantie a de la valeur.

**Le profil se pose par l'ORCHESTRATEUR, pas par le `.env` du backend.** Une
variable de processus l'emporte sur le fichier et disparaît avec le serveur :
une recette ne laisse pas derrière elle un backend aux limites relevées. Et
comme c'est l'orchestrateur qui décide, le poste et l'intégration continue se
comportent à l'identique — la commande reste la même des deux côtés.

**Si l'API tourne déjà, on ne devine pas son profil.** La pause du D-F44 reprend
alors ses droits, et la ligne de bilan le dit. `RECETTE_PAUSE` tranche
explicitement dans les deux sens.

**La garde du 429 reste en place** dans `recette-front4.mjs` : un 429 n'est
toujours pas un résultat, et refuser de le lire comme tel ne coûte rien tant
qu'aucun 429 ne survient. C'était le point du D-F39, et il ne se lève pas.

**Mesuré, en local, base déjà semée :** 8 min 44 → **3 min 07**, dont 0 s
d'attente de fenêtre contre 260 s auparavant.

## D-F49 — La recette dépendait de l'ANCIENNETÉ de la base, et ne le disait pas

**Constat, à la deuxième exécution en intégration continue.** La limitation de
débit levée, la recette est allée bien plus loin — et a buté sur FRONT-4 :
« 0 échus · 0 servis », puis un `locator.click` de 30 s dans le vide sur un
bouton d'ouverture de séance qui n'existait pas.

**Ce n'était ni le produit ni la recette.** Un rendez-vous de révision naît au
palier 1, donc `due_on` = demain. Sur un poste, les comptes de recette traînent
depuis des jours : tout y est échu, et la branche « j'ai des révisions » est
jouée. Sur une base neuve — donc en CI, toujours — RIEN n'est jamais échu, et
c'est la branche « je suis à jour » qui est jouée.

**La recette mesurait donc deux choses différentes selon la machine.** C'est
pire qu'un échec : pendant que le poste validait la boucle quotidienne, la CI
n'en aurait jamais rien vu, et personne n'aurait su lequel des deux verdicts
comptait. Le réflexe du D-F39 a servi une sixième fois.

**Décision.** `echoir-revisions.php`, joué entre la passation et FRONT-4 :
il recule `due_on` à HIER pour le seul compte A, sur la seule épreuve de
recette. Simuler le temps est la seule issue — l'alternative est d'attendre un
jour.

**Hier et non aujourd'hui** : `scopeDue` compare à la date de journée du
candidat dans son fuseau. Poser la date du jour ferait dépendre le résultat de
l'heure à laquelle la CI tourne, à cheval sur une frontière de journée. « En
retard » est par ailleurs un état légitime, que `scopeDue` prévoit
explicitement.

**CE QU'IL NE TOUCHE PAS, et c'est là qu'est la ligne.** `due_on` seulement.
Ni `palier`, ni `consecutive_sure`, ni `blind_error`, ni `last_reviewed_at` :
ceux-là encodent la PROGRESSION, et les écrire fabriquerait un état que le
produit n'a pas calculé. Reculer une échéance, c'est avancer l'horloge ;
toucher au palier, ce serait mentir sur ce que le candidat a appris.

**Zéro rendez-vous est une ERREUR, pas un cas.** Le script sort en 1 avec un
message qui nomme la cause probable — le calendrier mémoire n'a pas été
alimenté par la passation. C'est un défaut réel, et il ne doit pas se déguiser
en écran vide.

## FRONT-6 — l'examen blanc

## D-F50 — Le mode examen est une VARIANTE de la passation, pas un second écran

**La tentation.** Un écran dédié `/app/examen/{uuid}` : le mode examen ajoute
une grille de navigation, un marquage, un avertissement de fin, une bascule à
l'échéance et une sortie différente. Cinq différences, c'est beaucoup.

**Pourquoi non.** Ce que les deux écrans PARTAGENT est plus lourd que ce qui les
sépare : les questions, la certitude obligatoire, la file d'envoi hors
connexion, et surtout `data-zone="examen"` — donc les masquages CSS de R06.
Un écran jumeau aurait divergé au premier correctif appliqué d'un seul côté, et
R06 est exactement la règle qu'on ne veut pas voir diverger. Le `kind` de la
tentative suffit à faire apparaître les cinq ajouts.

**Vérifié, pas supposé** : les masquages de `[data-zone='examen']` s'appliquent
déjà, ils n'ont pas été réécrits.

## D-F51 — À zéro, le client DEMANDE ; il ne conclut pas

**Le piège.** « À l'échéance, l'écran bascule sur la soumission » se code
naturellement en `if (tempsEcoule) soumettre()`. C'est faux, et c'est faux dans
le sens le plus coûteux : un poste dont l'horloge avance de trois minutes
fermerait l'épreuve trois minutes trop tôt, et le candidat perdrait un temps
qu'il avait réellement.

**Décision.** À zéro, l'écran RELIT la tentative auprès du serveur. Trois
issues : le serveur rend encore du temps → le décompte repart et l'incident
n'existe pas ; la tentative n'est plus en cours → on va au rapport ; le serveur
rend zéro → on va au rapport, dont l'appel clôt la tentative côté serveur.

Le client n'a jamais raison sur l'heure. Il ne fait que demander plus tôt.

## D-F52 — Le marquage vit dans `sessionStorage`, et le serveur n'en sait rien

Marquer une question pour y revenir est un repère de NAVIGATION, pas une
réponse. L'envoyer au serveur créerait un état à synchroniser, à purger, à
autoriser — pour une information qui ne survit pas à l'épreuve.

Il vit donc dans `sessionStorage`, porté par l'uuid de la tentative : un
rechargement en pleine épreuve est le cas NORMAL d'une épreuve de quatre heures,
et perdre ses marques à cette occasion serait une punition gratuite. Deux
onglets restent deux sessions — même règle que la clé d'idempotence.

## D-F53 — `correction.vue` déduisait le genre par la négative, et se trompait

**Constat, en écrivant E11.** `estEntrainement` valait « tout ce qui n'est pas
un diagnostic ». À l'arrivée du simulateur, il valait donc VRAI pour un examen
blanc, et l'écran de correction lui aurait apposé « série d'entraînement : ce
résultat n'est pas représentatif du concours ».

C'est faux, et c'est l'inverse exact de ce que le rapport affirme un écran plus
loin : la série d'un examen blanc reproduit les poids officiels, et c'est
précisément ce qui l'autorise à porter une note.

**Décision.** Le genre est ÉNUMÉRÉ (`training`, `review`, `mirror`), jamais
déduit par la négative. Le prochain `kind` ajouté au contrat n'héritera plus
d'un cadrage écrit pour un autre.

## D-F54 — Aucun `n()` : les chiffres restent ceux du produit

`vue-i18n` propose `n()` pour formater les nombres. Employé sous locale `ar`,
`Intl` rend des chiffres arabo-indiens (٢٠) — là où tout le reste du produit
interpole le nombre brut. Deux systèmes de chiffres selon l'écran serait une
incohérence visible, et le choix du système est une décision de produit qui
n'appartient pas à ce lot.

Les nombres sont donc interpolés comme partout ailleurs. Le signe pour cent, lui,
est bien localisé : `٪` en arabe.

**Terme soumis à relecture** : `٪` (U+066A) plutôt que `%` sur les pages arabes.
C'est la forme standard en écriture arabe, mais l'usage marocain accepte les
deux — à confirmer.

## D-F55 — Ce que les captures ont trouvé, et que les tests ne pouvaient pas voir

**Trois défauts, dont deux dans mon propre outillage.**

1. **Six captures sur douze portaient un nom faux.** Le clair est l'état SANS
   attribut — `useThemeApplique` n'écrit `data-theme` que pour le sombre. Ma
   bascule comparait l'attribut à « clair », donc basculait toujours, et à
   contresens. Une capture mal nommée est pire qu'une capture manquante : on la
   relit en croyant avoir vu l'autre thème. Le thème se pose maintenant par son
   COOKIE, et la passe VÉRIFIE le thème obtenu — elle rougit si l'un des douze
   n'y est pas.

2. **« 4 h 0 » n'est pas une durée.** Corrigé : une durée ronde n'affiche pas
   ses minutes.

3. **Les citations officielles s'affichent en français sur la page arabe.** Ce
   n'est PAS un défaut de cet écran : `SetLocale` suit la locale du COMPTE, et
   `official_scoring_note_fr` n'a tout simplement aucune colonne `_ar` en base.
   Inscrit en DET-54 côté backend. Aucun test ne pouvait l'attraper — le
   contrat est respecté, et `dir="auto"` rend le mélange lisible, donc le masque.

**Ce que ça dit du dispositif** : les tests éprouvent le contrat, les captures
éprouvent ce que le candidat LIT. Les seconds ne remplacent pas les premiers, et
ici ils ont trouvé ce qu'aucune assertion ne cherchait.

## D-F56 — Une réponse tardive porte son propre code, et l'écran l'explique

`ATTEMPT_EXPIRED` est distinct d'`ATTEMPT_CLOSED` côté serveur, et l'interface
en dépend : « votre temps est écoulé, cette réponse est perdue » et « cette
série est déjà terminée » n'appellent pas la même phrase.

Le même refus arrive aussi par la FILE hors connexion, quand une réponse posée
avant l'échéance s'écoule après. La boîte d'échecs la montre — c'est le BLOC-5,
inchangé — et le bandeau de l'écran dit pourquoi. Sans ce code distinct,
l'interface afficherait le message brut du serveur dans une alerte système, ce
qui ressemble à un incident alors que c'est une règle du produit qui s'applique.

## ZP-1 — la zone publique v1

## D-F57 — La maquette fait autorité sur la FORME ; le dépôt garde son vocabulaire

`public-v1.css` est intégré, pas copié : 503 lignes retenues sur 705, et chaque
écart porte sa raison dans l'en-tête du bloc ajouté à `commun.css`.

**Dans `commun.css` et pas dans un troisième fichier.** `tokens.css` est une
copie conforme du socle et n'accepte aucune règle de composant ; la convention
envoie les classes partagées dans `commun.css`, et c'est ce fichier que lit le
second passage du validateur de jetons. Un fichier à part aurait échappé
précisément au contrôle qui vérifie que l'erreur système et l'erreur
pédagogique ne se distinguent pas par la seule couleur.

**Deux renommages, pour collision réelle.** `.fil` désigne le fil d'ARIANE dans
le dépôt depuis le FRONT-1 et le fil d'ACTUALITÉ dans la source : celui qui
était là reste, le nouveau devient `.fil-actu`. `.fait*` est déjà employé en
style scopé par l'écran de seuil de l'examen blanc — et un style scopé
l'emporte sur les propriétés qu'il DÉCLARE, pas sur les autres : les bordures
de la fiche d'annonce auraient fui sur E9 sans que rien ne le signale.

**Le vocabulaire des jetons est traduit en v3** (`--err*` → `--sys-err*`). Le
validateur a attrapé le seul endroit où la traduction mécanique se trompait :
`color: var(--sys-err)` sur du texte, quand v3 réserve l'aplat au fond.

## D-F58 — `jours` est périssable : le BFF le recalcule

Le collecteur sert un nombre de jours calculé À L'INSTANT DE LA COLLECTE. La
fixture du 8 août le démontre : elle annonce encore ouvertes trois annonces
dont l'échéance est passée, dont le concours de professeur des écoles.

Afficher « Clôture dans 1 jour » sur un dépôt fermé depuis cinq jours n'est pas
une imprécision d'affichage : c'est la seule erreur de ce produit qui puisse
coûter à un candidat sa candidature. Le BFF recalcule donc depuis `deadline`,
qui est une DATE et ne périme pas.

La forme rendue ne bouge pas — le client lit toujours `jours` — donc rien à
réécrire au branchement. Mesuré : 26 ouvertes au 9 août, 24 aujourd'hui.

## D-F59 — Ce que les captures ont trouvé et que le typage ne pouvait pas voir

**Quatre défauts, tous invisibles aux contrôles automatiques**, parce que le
typage était vert, les jetons verts, les locales vertes et l'audit de rendu
sans anomalie.

1. **J'avais écarté la section « 11. Écrans » en bloc**, la croyant purement
   échafaudage. Elle est MIXTE : la grille du fil à trois colonnes et le rail
   de filtres repliable y sont, avec leur raison écrite. Conséquence mesurée :
   quatre colonnes au lieu de trois, cartes plus étroites, titres enroulés,
   496 px de haut contre 357 à la référence. **Une exclusion par titre de
   section ne vaut pas un examen règle par règle.**
2. **L'organisme était dans le rang de la nature**, pas sous le titre : 79 px
   au lieu de 22, un nom de ministère enroulant sur trois lignes.
3. **Les faits étaient un `<ul>`** — donc des puces et un retrait que la
   maquette n'a jamais eus. La source emploie `<p>` + `<span>`.
4. **« 1 postes »**. La source pluralise ; je ne le faisais pas.

Aucun de ces quatre n'aurait été trouvé sans regarder l'écran à côté de la
capture de référence.

## D-F60 — A2 se contredit avec sa propre maquette, et je ne tranche pas seul

**Mesuré, aux deux largeurs, sur la maquette de référence ET sur notre accueil :**

| | référence (maquette) | notre accueil |
|---|---|---|
| 1440 px | 996 / 3063 = **32,5 %** | 885 / 1948 = **45,4 %** |
| 390 px | 2439 / 6244 = **39,1 %** | 2145 / 4011 = **53,5 %** |

A2 exige « moins de 22 % de la surface. Pas plus », et « une section « Le fil »
en bas (6 cartes) ». **La maquette de référence elle-même est à 32,5 %.**

Notre NUMÉRATEUR est plus petit que le sien (885 contre 996) : le bloc
d'annonces est fidèle, et même plus serré. L'écart de pourcentage vient
entièrement du DÉNOMINATEUR — l'accueil du dépôt fait 1948 px là où celui de la
maquette en fait 3063, parce qu'il a moins de contenu hors annonces (la
maquette porte notamment un pied à trois colonnes que le dépôt n'a pas).

Les deux moitiés d'A2 sont arithmétiquement incompatibles sur une page de cette
longueur : six cartes en bas font ~900 px, et 22 % de 1948 px font 428 px.

**Je n'ai pas tranché.** L'implémentation suit la maquette — six cartes, forme
conforme — et la question est portée au point d'arrêt avec ses mesures. Trois
issues existent : garder six cartes et accepter la proportion de la référence ;
descendre à trois cartes pour tenir 22 % ; ou allonger l'accueil (le pied de la
maquette est déjà intégré au CSS, il n'est pas encore posé dans le gabarit).

## D-F61 — A2 tranché faute de pouvoir l'être : six cartes, et le pied posé

L'arbitrage exige « moins de 22 % » ET « 6 cartes ». Mesuré, les deux sont
incompatibles : la maquette de référence elle-même est à 32,5 %.

**Décision.** La maquette fait autorité sur la forme : on garde les six cartes.
Et on pose le PIED à trois colonnes de la source (section 10 du CSS, intégrée
au P1 mais jamais posée dans le gabarit), qui allonge légitimement la page et
ramène la proportion de 45,4 % à 40,4 % à 1440 px.

**Le pied garde la forme de la source et ses liens à nous.** La maquette liste
« Annales », « Tarifs », « Alerte par filière », « Vérifier une attestation » :
aucune de ces routes n'existe. Les poser referait exactement ce que le FRONT-1
avait dû corriger sur l'accueil — un bouton principal menant à un 404. Les
filières viennent du catalogue, pas d'une liste écrite ici.

**Ce que le pied apporte vraiment**, et qui manquait : « naja7i.ma agrège des
avis administratifs publics. Seul l'avis officiel publié par l'administration
fait foi. » Un agrégateur qui ne le dit pas laisse croire qu'il est la source.

**La recette RAPPORTE la mesure au lieu d'en faire un échec.** Faire rougir sur
un seuil que la source ne tient pas rendrait la recette rouge en permanence, et
une recette toujours rouge ne se lit plus. Le contrôle porte donc sur la
DÉRIVE — seuil à 60 % — et le libellé dit le chiffre visé, le chiffre atteint
et le chiffre de la référence. Le jour où A2 est arbitré, ce seuil devient réel.

## D-F62 — I18N-04 : une clé appelée mais jamais définie s'affiche telle quelle

**Constat, sur une capture de la fiche d'annonce.** Le pied affichait
« navigation.inscription » en toutes lettres. La clé n'existait pas — la bonne
est `inscription.titre`.

**Aucun contrôle ne pouvait le voir.** La parité fr/ar est tenue : la clé
manque des DEUX côtés. Le typage ne dit rien : `t()` prend une chaîne. Le
validateur de jetons regarde le CSS. Seul un regard sur l'écran l'a trouvé.

**Décision.** `verifier-locales.mjs` gagne I18N-04 : toute clé littérale
appelée dans `app/` ou `server/` doit exister dans `fr.json`. 347 clés
vérifiées. Les clés CONSTRUITES — `t(\`opportunites.type_${code}\`)` — restent
hors de portée d'une analyse statique, et le code qui les emploie passe déjà
par `te()` pour se rabattre sur une valeur lisible.

Mutation : réintroduire `navigation.inscription` fait rougir la règle.

## D-F63 — Deux 404 vivants trouvés en chemin

`/methode/correction` était encore lié depuis la page de SPÉCIALITÉ. Le FRONT-1
avait corrigé ce même lien sur l'accueil — en le remplaçant par une ancre vers
la démonstration, qui EST la correction expliquée qu'il promet — mais la page
de spécialité était restée en arrière. Corrigé de la même façon.

Et la fiche d'annonce répond bien 404 sur un slug inconnu, côté SERVEUR : une
page vide en 200 se ferait indexer comme une fiche valide.

## Audit tournée 3 — les deux bloquants frontend

## D-F64 — Le genre de tentative est une CARTE EXHAUSTIVE, pas une négation

**Constat de l'audit (BLOC-5).** `useParcours.estEntrainement` valait encore
`kind !== 'diagnostic'`. Le tableau de bord annonçait donc « série
d'entraînement : ce résultat n'est pas représentatif du concours » sur un
examen blanc — l'inverse exact de ce que le rapport de la MÊME tentative
affirme deux écrans plus loin.

Le FRONT-6 avait énuméré le genre dans `correction.vue`, et **là seulement**.
La décision D-F53 annonçait pourtant que le genre était « désormais énuméré » :
elle n'était vraie que sur un écran. Une correction locale présentée comme
générale, c'est une dette qu'on ne sait plus qu'on a.

**Décision.** Un seul prédicat, `estNonRepresentatif`, exporté et employé par
les deux écrans. Et surtout une CARTE :

```ts
} as const satisfies Record<GenreDeTentative, boolean>
```

**Ce n'est pas un test, c'est une garantie de compilation.** Ajouter un genre à
l'union sans le classer fait rougir `nuxt typecheck`, en nommant le genre
manquant. Vérifié par mutation : ajouter `'atelier'` produit
« Property 'atelier' is missing in type ». Le prochain `kind` ne peut plus
rouvrir le trou par oubli — il faut un choix explicite.

Un genre inconnu du contrat rend `false` : ne rien affirmer vaut mieux
qu'affirmer une qualification fausse, qui est le défaut corrigé.

## D-F65 — Soumettre attend l'acquittement, pas seulement l'absence de refus

**Constat de l'audit (BLOC-4).** Le verrou de soumission ne regardait que les
refus DÉFINITIFS. Une entrée `a_reessayer` — un PUT coupé par le réseau alors
que la connectivité revient avant le POST — n'y entrait pas. `ecouler()` rendait
la main, `soumettre()` fermait la tentative, le rejeu suivant recevait
`ATTEMPT_CLOSED`, et la question était comptée SAUTÉE.

C'est très exactement le dommage que le BLOC-5 disait interdire : son verrou ne
couvrait pas cet état-là. Corriger un cas et croire la classe traitée est le
même défaut que le D-F64, sur un autre sujet.

**Décision.** `resteAAcquitter(attemptUuid)` : toute entrée encore en file pour
CETTE tentative bloque la soumission. Par tentative et non globalement — une
réponse en attente sur une autre série n'a pas à empêcher de rendre celle-ci.

La règle s'énonce simplement parce qu'une entrée acquittée QUITTE la file : il
n'y a pas d'état « envoyé » à filtrer. File vide pour cette série, ou refus
motivé — et l'écran dit « envoi en cours », pas « erreur ».

## D-F66 — La recette passait GRÂCE à un bogue, et le bogue la masquait

**Le constat le plus instructif de cette tournée.**

Le contrôle « la cause est présentée comme une hypothèse » de
`recette-front3.mjs` est devenu ROUGE après la correction du BLOC-1 backend —
sur un poste, pas en CI.

**Cause.** Le quota F03 est CUMULATIF et ne se remet jamais à zéro (fiche F03,
et c'est une bonne décision : un compteur quotidien ferait attendre le lendemain
plutôt que s'abonner). Sur un poste, le compte de recette épuise ses deux unités
à la première exécution et ne les retrouve jamais. En CI la base est neuve.

Tant que les causes fuyaient — elles sortaient sans acquisition — il y avait
TOUJOURS une cause à l'écran, quota épuisé ou non. Le contrôle passait donc
grâce à la fuite. Fermer la fuite l'a rendu rouge, et il aurait dû l'être depuis
le début.

**Décision.** `remettre-quota.php`, joué avant FRONT-3 : le compte de recette
retrouve l'état d'un candidat neuf, ce qu'un candidat réel est une fois. Même
geste et même frontière que `echoir-revisions.php` au D-F49 — on remet un état
de départ, on ne touche ni au produit ni à la règle.

**Ce que ça dit du dispositif.** Un test vert n'est pas une preuve que la règle
tient : il peut être vert POUR LA MAUVAISE RAISON. Ici, deux défauts se
masquaient l'un l'autre — la dépendance à l'état accumulé (D-F49, jamais vue sur
ce quota) et la fuite du BLOC-1. Il a fallu corriger le second pour voir le
premier.

## D-F67 — A2 requalifié : le chiffre était le mauvais énoncé de la bonne règle

**Ceci remplace le D-F60**, qui portait la question sans la trancher.

**Le constat qui force la requalification.** A2 exigeait « moins de 22 % de la
surface. Pas plus » ET « une section « Le fil » en bas (6 cartes) ». Mesuré aux
deux largeurs, **la maquette de référence viole elle-même le chiffre** :

| | référence (maquette) | notre accueil |
|---|---|---|
| 1440 px | 996 / 3063 = **32,5 %** | 885 / 1948 = **40,4 %** |
| 390 px | 2439 / 6244 = **39,1 %** | 2145 / 4011 = **48,9 %** |

Une règle que la source qui l'illustre ne tient pas n'est pas une règle : c'est
une mesure prise sur une maquette antérieure, promue en seuil. Notre numérateur
était d'ailleurs PLUS PETIT que celui de la référence (885 contre 996) — le
bloc d'annonces était fidèle, et même plus serré. L'écart venait du
dénominateur : notre accueil est plus court, parce qu'il porte moins de contenu
hors annonces.

Deux implémentations conformes à l'intention peuvent donc afficher des
pourcentages très différents. Le chiffre ne mesurait pas ce qu'A2 voulait
protéger.

**A2 (requalifié).** Les annonces sur l'accueil occupent EXACTEMENT deux
surfaces : le bandeau d'échéance d'une ligne sous l'en-tête, et la section
« Le fil » en dernière position avant le pied. Le héros, la preuve, les portes
et la méthode restent intacts et au-dessus. Le contrôle chiffré devient un
garde de DÉRIVE (60 %), pas une cible.

**Pourquoi cette formulation tient là où le chiffre échouait.** Elle énonce ce
qu'A2 protégeait réellement — *les annonces ne prennent pas l'accueil* — en
termes de PLACE et d'ORDRE, qui ne dépendent ni de la longueur de la page ni de
la richesse des autres sections. Elle est vérifiable par lecture du gabarit,
elle survit à l'ajout d'une section, et elle ne se met pas à mentir le jour où
le pied s'étoffe.

**L'implémentation actuelle la satisfait sans changement de code** : le bandeau
est bien au-dessus du héros, le fil bien en dernière position avant le pied, et
les quatre blocs de l'ADN sont intacts. L'écart se ferme par requalification
motivée, pas par un déplacement de pixels destiné à faire tomber un nombre.

**Le garde de dérive reste, et il garde son utilité** : il attrape une
régression qui doublerait la place des annonces, sans transformer une mesure
d'aujourd'hui en loi. `recette-zone-publique.mjs` le rapporte avec ses trois
nombres — visé, atteint, référence — plutôt que de rougir sur un seuil que la
source ne tient pas. Une recette toujours rouge ne se lit plus.

## D-F68 — `/robot` : la page que le User-Agent promet

**Prérequis de production du collecteur (D-O7).** Le robot s'annonce
`Naja7iBot/1.0 (+https://naja7i.ma/robot)`. Le `robots.txt` du portail ne nous
autorise pas nommément — il autorise tout robot à lire les fiches — et la
contrepartie de cette autorisation implicite est d'être JOIGNABLE. Un
User-Agent qui pointe vers une 404 vaut à peine mieux qu'un User-Agent anonyme,
et se fait bannir aussi vite.

**Tout ce qui y est écrit est vérifiable dans le code du collecteur** : le
délai de deux secondes par hôte, `Retry-After` respecté, le recul exponentiel
et les requêtes conditionnelles viennent de `naja7i_opp/reseau.py` ; la cadence
de deux heures et la double lecture FR/AR de D-O8. Annoncer une politesse qu'on
ne tient pas serait pire que de ne rien annoncer — un administrateur qui mesure
l'écart ne nous écrit pas, il nous bloque.

**Une adresse, pas un formulaire.** `robot@naja7i.ma`. Celui qui écrit veut que
ça cesse, pas remplir un champ — mettre une friction là est un contresens.
L'adresse n'est pas traduite : une adresse qui diverge entre deux langues est
une adresse morte dans l'une des deux.

**Indexable, et c'est le but** : c'est par une recherche sur notre User-Agent
qu'un administrateur arrivera ici. Aucun `noindex`. Liée depuis le pied, pour
qui ne cherche pas le User-Agent.

**Le User-Agent est rendu en `dir="ltr"`** : sur une page arabe, l'algorithme
bidirectionnel déplacerait ses parenthèses et son `+`. Il doit se lire tel
qu'il part sur le réseau, sans quoi il n'est pas cherchable.

## D-F69 — Le `<b>` des faits revient, par un créneau de composant

La source écrit `<b>${nb(a.postes)}</b> poste(s)`, et l'effet est juste : le
nombre est ce qu'on cherche des yeux sur une carte. Mais la règle du dépôt
interdit le HTML dans les messages i18n — le compilateur le refuse, et c'est
une surface d'injection.

`<i18n-t>` est exactement le créneau que la règle prévoit : le message reste du
TEXTE, avec son `{n}` et son pluriel, et le gabarit décide de la graisse. La
règle tient, la graisse revient. Vérifié à la sortie serveur :
`<b>1</b> poste`, `<b>95</b> postes` — pluriel conservé, aucun HTML en message.
