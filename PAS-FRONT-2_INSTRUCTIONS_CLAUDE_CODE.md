# FRONT-2 — Catalogue public

**Dépôt :** `optimgov/Naja7i_frontend` — état attendu : `d72584c`
**Objet :** rendre le catalogue visible, et fermer les deux écarts frontend
relevés par l'audit — typage rouge et absence de CI.

---

## DÉCISIONS PRÉ-ARBITRÉES

| Situation | Décision |
|---|---|
| Le backend n'est pas démarré | `cd ~/Coding/Naja7i_backend_front && php artisan serve` |
| Le catalogue est vide | Exécuter `php artisan db:seed` côté backend |
| `npm run typecheck` échoue sur un fichier du FRONT-1 | **Corriger le fichier**, jamais assouplir la configuration TypeScript |
| Une dépendance manque pour `useSeoMeta` | Elle est fournie par Nuxt 3, vérifier la version avant d'installer quoi que ce soit |
| Tentation d'écrire une valeur en dur dans les compteurs | **Interdit.** NAJA7I-ZP-001 §9, premier critère de recette |
| Tentation d'ajouter Tailwind ou un kit d'interface | **Interdit.** Le CSS est écrit à la main |
| Un endpoint attendu n'existe pas côté API | Le signaler avec le chemin exact, ne pas inventer de repli |

---

## Étapes

1. **Démarrer les deux serveurs** — backend sur 8000, frontend sur 3000.

2. **Appliquer l'overlay.**

3. **Créer le layout `public`** (`app/layouts/public.vue`) : en-tête avec la
   marque, navigation, sélecteur de langue, pied de page. S'inspirer du layout
   `auth` existant. Appeler `useLangueEtDirection()` dedans.

4. **Créer le composant `ProofDemonstration`** — le bloc de preuve du héros.
   Il consomme `GET /api/v1/demonstration/correction` et affiche l'énoncé, les
   quatre options avec leurs justifications, la cause étiquetée.

   **Il doit porter une mention d'exemple visible**, issue de `meta.notice` de
   la réponse — pas d'un texte codé en dur. Si l'API répond 404 (banque vide),
   afficher un état de repli sobre plutôt qu'une erreur.

5. **Compléter `assets/css/tokens.css`** avec les jetons employés par les
   nouvelles pages : `--t-4xl`, `--t-2xl`, `--e-6`, les rampes `--vert-*`,
   `--sable-*`, `--terre-*`, `--safran-*`, et les classes partagées
   (`.enveloppe`, `.section`, `.grille`, `.oeil`, `.fil`, `.titre-page`,
   `.chapeau`, `.btn`, `.lien-second`). Reprendre les valeurs de la maquette v3.

6. **Ajouter les clés de traduction** dans `i18n/locales/fr.json` et `ar.json` :
   tous les `t('accueil.*')` et `t('catalogue.*')` employés par les pages.
   Aucune clé brute ne doit s'afficher.

7. **Vérifier** :
   ```bash
   npm run typecheck   # doit être vert — il ne l'était pas
   npm run build
   ```

8. **Dérouler `docs/RECETTE-FRONT-2.md`** et consigner le résultat de chaque
   ligne. La ligne 6 est la plus importante.

9. **Commit et push**, puis vérifier que la nouvelle CI passe.

## Points de vigilance

- **Aucune valeur en dur.** Les compteurs de l'accueil viennent du catalogue.
  Couper l'API doit les faire disparaître, pas afficher un chiffre figé.
- **404 jamais 403** pour une ressource non publiée.
- **Une spécialité en liste d'attente ne propose pas de diagnostic.**
- **Propriétés CSS logiques uniquement.** Une seule `margin-left` casse le RTL,
  et personne ne le verra avant un utilisateur arabophone.
- **Les coefficients 8, 12, 20 doivent être lisibles d'un coup d'œil.** C'est
  la correction du PAS-4.1 portée à l'écran : la maquette v1 laissait croire
  que la didactique pesait un tiers alors qu'elle vaut 12 sur 40.
