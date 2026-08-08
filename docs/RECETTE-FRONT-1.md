# Recette FRONT-1 — socle Nuxt 3 + BFF Nitro

**Date d'exécution :** 8 août 2026
**Objet du lot :** prouver que la chaîne de cookies fonctionne de bout en bout —
navigateur → Nitro → Laravel → retour.
**Verdict global :** **10 points sur 11 conformes.** Le point 10 est
partiellement conforme : le comportement frontend est correct, le défaut
restant est côté API et sort du périmètre de ce lot.

---

## Conditions d'exécution

| Élément | Valeur |
|---|---|
| Frontend | Nuxt **3.21.11** (Nitro 2.13.4, Vite 7.3.6, Vue 3.5.41) sur `http://localhost:3000` |
| Module i18n | `@nuxtjs/i18n` **9.5.6** — dernière ligne compatible Nuxt 3 |
| Backend | `~/Coding/Naja7i_backend_front`, `php artisan serve` sur `http://localhost:8000` |
| Services | PostgreSQL 16, Redis 7, Mailpit — via `docker compose` sous Colima |
| Mailpit | `http://localhost:8025` |
| Navigateur | Google Chrome, piloté par Playwright 1.62.1 |

**Configuration API vérifiée** (étape 5 des instructions), telle que résolue par
Laravel et non telle qu'écrite dans le fichier :

```
session.domain   = localhost
sanctum.stateful = localhost | localhost:3000 | 127.0.0.1:3000
frontend_url     = http://localhost:3000
session.driver   = redis
mail             = smtp:1025 (Mailpit)
```

### Honnêteté de méthode

Les onze points ont été déroulés dans un **vrai Chrome**, mais **pilotés par
script**, pas cliqués à la main. Le script est conservé en
`docs/recette-front-1/recette.mjs` et rejouable. Ce choix rend la recette
reproductible et permet d'instrumenter le réseau — ce qu'un œil humain ne peut
pas faire pour le point de vigilance « aucun appel direct à l'API ». En
contrepartie, il ne remplace pas un regard humain sur le rendu : les captures
de `docs/recette-front-1/` sont fournies pour cela, et le point 9 (RTL) a été
vérifié visuellement, pas seulement par l'attribut `dir`.

**Un plafond gêne la recette :** `auth/register` est limité à 6 requêtes par
minute et par IP (`throttle:6,1`, `routes/api.php:40`). La recette enchaîne
quatre inscriptions ; sans pause, l'exécution déclenche elle-même le plafond et
produit de faux échecs. Le script insère 65 secondes avant les points 9, 10 et
11. **Un opérateur humain qui reprend la recette d'affilée rencontrera le même
plafond** — c'est un piège de la recette, pas un défaut du produit.

---

## Les onze points

Comptes créés lors de la passe de référence :
`recette.fr.1786171882982@naja7i.test` et `recette.ar.1786171882982@naja7i.test`.

| # | Action | Attendu | Constaté | Verdict |
|---|---|---|---|---|
| 1 | Créer un compte à `/fr/inscription` | Redirection vers « Confirmer votre adresse » | `POST /api/v1/auth/register` → **201**, redirection vers `/fr/verifier-email`, titre « Confirmer votre adresse » | **Conforme** |
| 2 | Ouvrir Mailpit | L'e-mail est là, en français | E-mail reçu, sujet « **Confirmez votre adresse e-mail** », corps français | **Conforme** |
| 3 | Cliquer le lien de l'e-mail | Page verte « Votre adresse est confirmée » | Alerte « Votre adresse est confirmée. », fond `rgb(238,248,244)` sur texte `rgb(8,74,59)` — vert pâle sur vert profond | **Conforme** |
| 4 | Aller sur `/fr/app` | E-mail, statut confirmé, rôle `candidat`, UUID | Les quatre présents : adresse, pastille « Confirmée », rôle `candidat`, UUID v7 | **Conforme** |
| 5 | Recharger (F5) | La session tient | Toujours sur `/fr/app`, contenu identique, aucun retour à la connexion | **Conforme** |
| 6 | Se déconnecter puis revenir sur `/fr/app` | Redirection vers la connexion | Redirection vers `/fr/connexion` | **Conforme** |
| 7 | Se reconnecter | Retour à l'espace | Retour sur `/fr/app`, session rétablie | **Conforme** |
| 8 | Mot de passe oublié → lien → nouveau mot de passe | Connexion possible avec le nouveau | E-mail « Réinitialiser votre mot de passe », « Votre mot de passe est à jour. », connexion réussie avec le nouveau | **Conforme** |
| 9 | Reprendre en `/ar/inscription` | Interface arabe, lecture de droite à gauche, e-mail en arabe | `dir="rtl"` `lang="ar"`, titre « تأكيد بريدك الإلكتروني », e-mail « أكد بريدك الإلكتروني ». **Mise en page réellement inversée** : le panneau de marque passe à droite, la bascule de langue à gauche (`09-arabe-rtl.png`) | **Conforme** |
| 10 | Saisir un mot de passe de 8 caractères | Message d'erreur sous le champ, dans la bonne langue | Refus **422**. Message affiché **au bon endroit**, sous le champ mot de passe. Mais le texte est la **clé brute `validation.min.string`**, pas une phrase traduite — en arabe comme en français | **Partiel — voir écart n°3** |
| 11 | Décocher les CGU et soumettre | Refus, message sous la case | Refus **422**, message sous la case : « Vous devez accepter les conditions générales pour créer un compte. » | **Conforme** |

---

## Points de vigilance des instructions

| Point | Vérification | Résultat |
|---|---|---|
| Le navigateur ne doit jamais appeler `localhost:8000` | Toutes les requêtes du navigateur interceptées pendant les onze points | **0 appel direct.** Tout passe par `localhost:3000` |
| `decodeURIComponent` sur `XSRF-TOKEN` | Aucune écriture n'a produit de 419 | **Conforme** — le décodage est en place (`useApi.ts`) |
| Ne pas transmettre `origin` ni `referer` | Aucune erreur « Session store not set » ; les sessions traversent le BFF | **Conforme** (`server/routes/api/[...].ts`) |
| Gardes de route = confort, pas sécurité | L'API refuse en 401 indépendamment du client (points 6 et 11) | **Conforme** |
| Propriétés CSS logiques uniquement | Recherche de `margin-left/right`, `padding-left/right`, `left:`, `right:`, `text-align: left/right` dans `app/` et `assets/` | **Aucune occurrence.** Confirmé visuellement au point 9 |

---

## Écarts constatés

### Corrigés dans ce lot

**Écart n°1 — l'application ne démarrait pas : Nuxt servait sa page d'accueil**
*Sévérité : bloquant. Corrigé.*

L'overlay range le code applicatif sous `app/` (app.vue, pages, layouts,
composables, middleware) : c'est l'arborescence Nuxt 4. Sur Nuxt 3 elle n'est
pas active par défaut — Nuxt cherchait `pages/` à la racine, n'en trouvait
aucune et servait sa page de bienvenue. Toute la recette était impossible.

Correction dans `nuxt.config.ts` : `future: { compatibilityVersion: 4 }`. On
reste sur Nuxt 3 comme le veut la décision pré-arbitrée ; seule la convention
de dossiers change. En conséquence `~` désigne `app/`, or `assets/css/tokens.css`
est à la racine (comme le documente le README) : la feuille de style est donc
référencée en `~~/assets/css/tokens.css`.

**Écart n°2 — toute écriture échouait en silence**
*Sévérité : bloquant. Corrigé.*

L'inscription ne partait jamais : `/sanctum/csrf-cookie` répondait 204, puis
plus rien. Aucun message à l'écran, le bouton revenait à son état normal.

Cause : dans `useApi.ts`, `useI18n()` était appelé **après** le premier `await`
(celui de `ensureCsrf`). Un composable Vue exige un contexte actif ; après un
`await` ce contexte est perdu et l'appel lève
`SyntaxError: Must be called at the top of a 'setup' function`. Cette exception
n'étant pas une `ApiRequestError`, tous les écrans la filtraient sans rien
afficher — la requête ne partait pas et l'utilisateur ne voyait rien.

Correction : résolution de l'i18n une seule fois, pendant l'appel synchrone de
`useApi()`, via `useNuxtApp().$i18n`. `$i18n` plutôt que `useI18n()` parce que
`useApi()` est aussi appelé depuis les middlewares de route, qui ne sont pas non
plus un contexte de `setup`.

**Écart n°3 (volet frontend) — aucun message sous les champs fautifs**
*Sévérité : majeur. Corrigé.*

Les points 10 et 11 échouaient : l'API refusait bien en 422, mais l'interface
n'affichait qu'une alerte générale, jamais le message sous le champ concerné.

Cause : l'API renvoie `details` sous forme de **tableau** — `[{field, messages}]` —
alors que `ApiRequestError.fieldErrors` le traitait comme un **dictionnaire**
`{champ: [messages]}`. `Object.entries` sur un tableau produit les clés « 0 »,
« 1 »…, dont la valeur est un objet sans `.length` : tout était filtré et
`fieldErrors` ressortait vide. L'écran basculait alors sur l'alerte générale.

Correction : les deux formes sont acceptées, pour ne pas dépendre d'un détail
de sérialisation côté API.

**Écart n°4 — `npm run typecheck` ne pouvait pas s'exécuter**
*Sévérité : mineur. Corrigé.*

Le script existe dans `package.json` mais l'overlay ne fournit pas de
`tsconfig.json` : `Cannot find matching tsconfig.json`. Ajout d'un
`tsconfig.json` racine étendant `./.nuxt/tsconfig.json`.

### Ouverts — hors périmètre de ce lot

**Écart n°5 — messages de validation non traduits (côté API)**
*Sévérité : majeur. Non corrigé : dépôt backend.*

C'est ce qui empêche le point 10 d'être pleinement conforme. L'API renvoie la
clé de traduction brute au lieu du texte :

```json
"details":[{"field":"password","messages":["validation.min.string"]}]
```

Le candidat lit donc « validation.min.string » sous le champ, en français comme
en arabe. Le message général l'entoure pourtant correctement traduit
(« Les données envoyées sont invalides. » / « البيانات المرسلة غير صالحة. »),
et le message des CGU l'est aussi (point 11) — ces deux-là ont des lignes
dédiées dans `lang/*/errors.php`.

Cause : `lang/fr/` et `lang/ar/` contiennent `auth.php`, `errors.php` et
`mail.php`, mais **pas `validation.php`**. Laravel retombe alors sur la clé.

Correction attendue côté `Naja7i_backend_front` : ajouter
`lang/fr/validation.php` et `lang/ar/validation.php`. Le frontend est prêt — il
affichera le texte au bon endroit dès que l'API l'enverra, sans modification.

**Écart n°6 — 500 au lieu de 401 sur requête non-JSON**
*Sévérité : mineur. Non corrigé : dépôt backend.*

`GET /api/v1/me` sans en-tête `Accept: application/json` renvoie **500** au lieu
de 401 : l'application étant API-only, Laravel tente une redirection vers une
route `login` qui n'existe pas (`Route [login] not defined`).

Sans effet sur ce lot — le BFF force `Accept: application/json`, et l'en-tête
est toujours présent dans le parcours réel. À corriger côté backend pour que
l'API soit correcte hors BFF.

**Écart n°7 — erreurs de typage résiduelles dans l'overlay**
*Sévérité : mineur. Non corrigé : choix assumé.*

`npm run typecheck` remonte quatre erreurs préexistantes, sans effet à
l'exécution :

- `app/layouts/auth.vue:11` et `app/pages/app/index.vue:9` — `htmlAttrs` reçoit
  un `ComputedRef` que le typage de `useHead` n'accepte pas. **Fonctionne
  parfaitement à l'exécution** : c'est ce code qui produit le RTL validé au
  point 9.
- `nuxt.config.ts:20` et `:23` — `Cannot find name 'process'`, faute de
  `@types/node`.

Non corrigées volontairement : la seule correction pour les deux dernières est
d'ajouter `@types/node`, or la décision pré-arbitrée est explicite —
« dépendance non listée : ne rien ajouter ».

**Écart n°8 — doublons dans le `.env` du backend**
*Sévérité : cosmétique. Non corrigé : dépôt backend.*

`SESSION_DOMAIN`, `MAIL_MAILER` et `MAIL_PORT` sont définis deux fois (lignes 34
et 72, 50 et 80, 53 et 82). La dernière occurrence l'emporte et la configuration
résolue est correcte — vérifiée avant de commencer. Le fichier reste trompeur à
la lecture : `SESSION_DOMAIN=null` puis `SESSION_DOMAIN=localhost` invite à un
mauvais diagnostic le jour où la session cassera.

---

## Ce que cette recette prouve

La chaîne de cookies fonctionne de bout en bout. Les points 4, 5, 6 et 7 le
démontrent ensemble : une session ouverte à travers le BFF survit à un
rechargement complet (5), se ferme réellement à la déconnexion (6) et se
rouvre (7). Aucune requête du navigateur n'a jamais atteint `localhost:8000` —
le BFF n'est jamais court-circuité.

Le bilinguisme tient au-delà de l'affichage : la mise en page s'inverse
réellement, et les e-mails partent dans la langue du candidat (points 2 et 9).

Le seul défaut résiduel visible par un candidat est l'écart n°5 — un message de
validation affiché en clé technique. Il est localisé, compris, et se corrige
côté API sans toucher au frontend.

---

## Rejouer la recette

```bash
# Backend
cd ~/Coding/Naja7i_backend_front
colima start && docker compose up -d
php artisan serve

# Frontend
cd ~/Coding/Naja7i_frontend
npm install && cp .env.example .env
npm run dev
```

Manuellement : dérouler le tableau ci-dessus depuis
`http://localhost:3000/fr/inscription`, en **espaçant les inscriptions d'une
minute** (plafond de 6/minute).

Automatiquement :

```bash
cd docs/recette-front-1
npm install playwright        # hors du projet de préférence
node recette.mjs
```

Le script recrée des comptes horodatés, vide Mailpit au démarrage, écrit ses
captures et signale tout appel direct du navigateur vers l'API.
