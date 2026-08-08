# FRONT-1 — Instructions d'exécution pour Claude Code

**Nouveau dépôt :** `optimgov/Naja7i_frontend` (à créer, vide)
**Objet :** socle Nuxt 3 + BFF Nitro, écrans d'authentification bilingues.

**Ce que cette tranche existe pour prouver :** que la chaîne de cookies
fonctionne de bout en bout — navigateur → Nitro → Laravel → retour. C'est le
point le plus risqué de toute l'intégration, et le seul qu'on ne peut pas
valider par du code isolé. Le reste (richesse des écrans, SEO, catalogue) vient
après, une fois le tuyau prouvé.

**Ne pas confondre avec `optimgov/Najah.ma`**, qui est le prototype HTML de
démonstration. Il reste tel quel ; il n'est pas migré ni modifié.

---

## DÉCISIONS PRÉ-ARBITRÉES — ne pose aucune question sur ces points

| Situation | Décision |
|---|---|
| Dépôt `Naja7i_frontend` inexistant | Le créer, ou travailler en local et signaler qu'il reste à créer |
| Version de Nuxt | Nuxt 3 (pas Nuxt 4) — dernière 3.x stable |
| Gestionnaire de paquets | `npm`, cohérent avec le reste de la machine |
| Module i18n en conflit de version | Prendre la version compatible Nuxt 3 et le noter |
| Tailwind, UI kit, ou autre dépendance non listée | **Ne rien ajouter.** Le CSS est écrit à la main dans `assets/css/tokens.css` |
| Port 3000 occupé | Utiliser 3001 et l'indiquer, en ajustant `SANCTUM_STATEFUL_DOMAINS` côté API |
| L'API Laravel n'est pas démarrée | La démarrer : `php artisan serve` depuis `~/Coding/Naja7i_backend_front` |
| Erreur 419 sur une écriture | C'est le CSRF. Vérifier l'ordre : `/sanctum/csrf-cookie` d'abord, puis décodage `decodeURIComponent` du cookie. Ne pas désactiver la protection CSRF |
| Erreur « Session store not set » | Vérifier que le relais ne transmet PAS `origin` ni `referer` |
| Choix de nommage, ordre des méthodes | Trancher toi-même |

**Arrête-toi uniquement si :** perte de données possible, ou l'API backend est
introuvable.

---

## Étapes

1. **Créer le projet** dans `~/Coding/` :
   ```bash
   cd ~/Coding
   npx nuxi@latest init Naja7i_frontend --package-manager npm --no-gitInit
   cd Naja7i_frontend
   git init && git branch -M main
   ```

2. **Appliquer l'overlay** — écraser `nuxt.config.ts`, `package.json` et
   `app/app.vue` s'ils existent. Puis :
   ```bash
   npm install
   npm install @nuxtjs/i18n
   cp .env.example .env
   ```

3. **Créer `app/app.vue`** s'il n'existe pas :
   ```vue
   <template><NuxtLayout><NuxtPage /></NuxtLayout></template>
   ```

4. **Démarrer les deux serveurs.** Terminal 1, depuis le backend :
   ```bash
   cd ~/Coding/Naja7i_backend_front
   colima start && docker compose up -d
   php artisan serve          # http://localhost:8000
   ```
   Terminal 2, depuis le frontend :
   ```bash
   cd ~/Coding/Naja7i_frontend
   npm run dev                # http://localhost:3000
   ```

5. **Vérifier la configuration côté API.** Dans le `.env` du backend :
   ```
   SANCTUM_STATEFUL_DOMAINS=localhost:3000,127.0.0.1:3000
   SESSION_DOMAIN=localhost
   FRONTEND_URL=http://localhost:3000
   ```

6. **Recette manuelle — c'est le vrai livrable de ce lot.**
   Dérouler dans le navigateur, à `http://localhost:3000/fr/inscription` :

   | # | Action | Attendu |
   |---|---|---|
   | 1 | Créer un compte | Redirection vers « Confirmer votre adresse » |
   | 2 | Ouvrir http://localhost:8025 (Mailpit) | L'e-mail est là, en français |
   | 3 | Cliquer le lien de l'e-mail | Page verte « Votre adresse est confirmée » |
   | 4 | Aller sur `/fr/app` | L'écran affiche e-mail, statut confirmé, rôle `candidat`, UUID |
   | 5 | Recharger la page (F5) | La session tient — pas de retour à la connexion |
   | 6 | Se déconnecter, puis revenir sur `/fr/app` | Redirection vers la connexion |
   | 7 | Se reconnecter | Retour à l'espace |
   | 8 | Mot de passe oublié → lien Mailpit → nouveau mot de passe | Connexion possible avec le nouveau |
   | 9 | Reprendre en `/ar/inscription` | Interface en arabe, **lecture de droite à gauche**, e-mail en arabe |
   | 10 | Saisir un mot de passe de 8 caractères | Message d'erreur en dessous du champ, dans la bonne langue |
   | 11 | Décocher les CGU et soumettre | Refus, message sous la case |

   **Consigner le résultat de chaque ligne dans `docs/RECETTE-FRONT-1.md`**,
   avec les écarts constatés. C'est ce document qui prouve que la chaîne
   fonctionne — plus que le code lui-même.

7. **Commit et push** :
   ```bash
   git add -A
   git commit -m "FRONT-1: socle Nuxt 3 + BFF Nitro — relais API avec cookies de session, écrans d'authentification FR/AR avec RTL, recette de bout en bout"
   git remote add origin https://github.com/optimgov/Naja7i_frontend.git
   git push -u origin main
   ```

---

## Points de vigilance

- **Le navigateur ne doit jamais appeler `localhost:8000`.** Si l'onglet réseau
  montre un appel direct à l'API, le BFF est court-circuité et la mise en
  production échouera. Tous les appels partent vers `localhost:3000`.
- **`decodeURIComponent` sur le cookie XSRF-TOKEN.** Laravel le pose
  URL-encodé. L'oublier produit un 419 sur toutes les écritures, sans message
  explicite. C'est l'erreur d'intégration Sanctum la plus fréquente.
- **Ne pas transmettre `origin` ni `referer`** dans le relais. Le middleware
  `EnsureBffRequestsAreStateful` côté API traite leur absence comme la
  signature d'un appel BFF légitime.
- **Les gardes de route sont un confort, pas une sécurité.** Le serveur reste
  seul juge. Ne jamais afficher de contenu premium en se fiant à un état client.
- **Propriétés CSS logiques uniquement** (`margin-inline`, `padding-block`).
  Une seule `margin-left` casse le RTL sur cet écran, et personne ne le verra
  avant un utilisateur arabophone.

## Ce que ce lot ne fait pas

Page d'accueil publique, portails, catalogue, SEO, diagnostic, entraînement.
Le prototype HTML reste la référence visuelle de ces écrans ; ils seront
reconstruits en Nuxt lot par lot, une fois le socle prouvé.
