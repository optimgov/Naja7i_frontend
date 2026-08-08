# Naja7i — Frontend candidat

Application Nuxt 3 du front-office de **naja7i.ma** (نجاحي — « ma réussite »).

Le navigateur ne parle **jamais** directement à l'API Laravel : Nitro sert de
BFF et relaie de serveur à serveur. Cette contrainte n'est pas cosmétique — elle
permet des cookies de session httpOnly limités à l'hôte, donc aucun jeton
accessible au JavaScript de la page.

## Démarrer

Deux serveurs, deux terminaux.

```bash
# Backend
cd ~/Coding/Naja7i_backend_front
colima start && docker compose up -d
php artisan serve

# Frontend
cd ~/Coding/Naja7i_frontend
npm install
cp .env.example .env
npm run dev
```

Ouvrir http://localhost:3000/fr/inscription
E-mails de développement : http://localhost:8025 (Mailpit)

## Architecture

```
server/routes/api/[...].ts      relais BFF vers l'API  ← la pièce critique
server/routes/sanctum/          relais du cookie CSRF
app/composables/useApi.ts       client unique, gestion CSRF et erreurs
app/composables/useAuth.ts      état d'authentification partagé SSR
app/middleware/                 gardes de route (confort, pas sécurité)
assets/css/tokens.css           charte validée, propriétés logiques pour le RTL
i18n/locales/                   fr.json · ar.json
```

**Règle absolue :** aucun composant n'appelle `$fetch` directement. Tout passe
par `useApi()`. Un changement de contrat n'a alors qu'un seul point d'impact.

## Bilinguisme

Français et arabe, avec bascule complète en lecture de droite à gauche. Le RTL
n'est pas une surcouche : le CSS n'utilise que des propriétés logiques
(`margin-inline-start`, jamais `margin-left`). Les URL sont préfixées par la
langue (`/fr/…`, `/ar/…`) — les liens envoyés par e-mail en dépendent.

## Références

- Backend : `optimgov/Naja7i_backend_front` · ADR-0004 (cookies BFF), ADR-0008 (e-mails)
- Prototype de démonstration : `optimgov/Najah.ma` — référence visuelle, pas une base de code
