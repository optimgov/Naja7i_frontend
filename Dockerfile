# syntax=docker/dockerfile:1.7
#
# Image de production du frontend Naja7i (Nuxt 3, rendu serveur).
#
# Ce conteneur est le SEUL que le navigateur atteint : il sert les pages et
# relaie l'API (server/routes/api/[...].ts). L'API Laravel reste sur le réseau
# interne, sans port publié.
#
# La version de Node n'est pas écrite ici. Elle vit dans `.nvmrc`, comme le dit
# déjà le commentaire de .github/workflows/ci.yml : deux chiffres maintenus en
# parallèle finissent toujours par diverger. La CI passe
# `--build-arg NODE_VERSION=$(cat .nvmrc)`, et la valeur par défaut ci-dessous
# n'existe que pour une construction manuelle.
ARG NODE_VERSION=24.18.0

########################################################################
# Étape 1 — compilation
########################################################################
FROM node:${NODE_VERSION}-alpine AS build

WORKDIR /app

# `npm ci` refuse un package-lock.json désaccordé du package.json. C'est
# volontaire : il vaut mieux une construction rouge qu'une image construite
# avec des versions que personne n'a testées.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# `nuxt prepare` régénère .nuxt/ — la CI le fait déjà avant le typage, et
# l'omettre ici ferait échouer la compilation sur des types manquants.
RUN npx nuxt prepare

# API_BASE_URL est fourni à la compilation UNIQUEMENT pour satisfaire
# nuxt.config.ts, qui lit process.env au moment du build. La valeur réellement
# employée en production est NUXT_API_BASE_URL, lue à l'exécution par Nitro —
# voir la remarque en tête de l'étape 2. Figer ici l'adresse de l'API
# obligerait à reconstruire l'image pour chaque environnement.
ENV API_BASE_URL=http://build-time-placeholder.invalid
RUN npm run build


########################################################################
# Étape 2 — exécution
########################################################################
#
# CONFIGURATION À L'EXÉCUTION, PAS À LA COMPILATION
#
# nuxt.config.ts déclare `runtimeConfig.apiBaseUrl` et
# `runtimeConfig.public.appProtocol`. Nitro accepte de les remplacer au
# démarrage par les variables NUXT_API_BASE_URL et NUXT_PUBLIC_APP_PROTOCOL
# (règle Nuxt : NUXT_ + le chemin de la clé en MAJUSCULES_AVEC_UNDERSCORES).
#
# Ce sont ces deux noms-là qu'il faut renseigner sur le serveur. Poser
# API_BASE_URL sur le conteneur d'exécution N'A AUCUN EFFET : nuxt.config.ts
# ne le lit qu'au moment du build. C'est le piège le plus coûteux de cette
# image — le conteneur démarre, répond, et appelle une API inexistante.
#
FROM node:${NODE_VERSION}-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0

# La sortie de Nuxt est autonome : ses dépendances y sont déjà regroupées.
# Aucun `npm install` ici, aucun node_modules, aucune source.
COPY --from=build --chown=node:node /app/.output ./

USER node
EXPOSE 3000

# `/sante` (server/routes/sante.ts) et NON une page de l'application.
#
# `/fr/connexion` paraissait un meilleur choix — elle traverse tout le rendu —
# mais elle déclare `middleware: 'guest'`, lequel appelle `fetchMe()` à chaque
# rendu serveur. La sonde partait donc dans le relais jusqu'à Laravel, ouvrait
# une session Redis à chaque passage, et déclarait le frontend malade quand
# c'était l'API qui redémarrait. Une sonde de conteneur mesure la vivacité DE
# CE conteneur, rien d'autre.
HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=4 \
  CMD wget -q --spider http://127.0.0.1:3000/sante || exit 1

CMD ["node", "/app/server/index.mjs"]
