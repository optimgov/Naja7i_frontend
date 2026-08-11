# Recette FRONT-2 — catalogue public

À dérouler dans un navigateur réel, backend et frontend démarrés.

| # | Action | Attendu |
|---|---|---|
| 1 | `/fr/` | Trois portes affichées, compteurs cohérents avec le catalogue |
| 2 | Compteurs de l'accueil | Aucune valeur en dur : couper l'API doit les faire disparaître, pas afficher un chiffre figé |
| 3 | `/fr/concours` | Les trois filières, avec leur nombre de familles |
| 4 | `/fr/concours/sciences-education` | Quatre familles, CRMEF marqué « ouvert » |
| 5 | `/fr/concours/famille/crmef` | Onze spécialités, trois épreuves avec coefficients 8, 12, 20 |
| 6 | Coefficients affichés | Vérifier que la spécialité pèse 20 et les sciences de l'éducation 8 — l'inverse de ce que suggérait la maquette v1 |
| 7 | Session 2026 | Mention « dates non confirmées » visible |
| 8 | `/fr/concours/famille/crmef/langue-francaise` | Bouton de correction présent |
| 9 | `/fr/concours/famille/crmef/mathematiques` | **Aucun** bouton de diagnostic — spécialité en liste d'attente |
| 10 | `/fr/concours/famille/inexistante` | Page 404, pas 403 |
| 11 | `/ar/concours/famille/crmef` | Interface arabe, mise en page inversée, noms de domaines traduits |
| 12 | Code source de `/fr/concours/famille/crmef` | Contenu présent sans JavaScript ; `hreflang` réciproque fr/ar |
| 13 | Onglet réseau, parcours complet | Aucun appel direct vers `localhost:8000` |
| 14 | Fenêtre à 320 px | Aucun débordement horizontal |
| 15 | Navigation au clavier | Repère de focus visible sur chaque lien et bouton |

Consigner le résultat de chaque ligne, avec les écarts. La ligne 6 est la plus
importante : c'est la correction structurelle du PAS-4.1 portée à l'écran.
