# Recette FRONT-2 — catalogue public

À dérouler dans un navigateur réel, backend et frontend démarrés.

| # | Action | Attendu |
|---|---|---|
| 1 | `/fr/` | Trois portes affichées, compteurs cohérents avec le catalogue |
| 2 | Compteurs de l'accueil | Aucune valeur en dur : couper l'API doit les faire disparaître, pas afficher un chiffre figé |
| 3 | `/fr/concours` | Les trois filières, avec leur nombre de familles |
| 4 | `/fr/concours/sciences-education` | Quatre familles, CRMEF marqué « ouvert » |
| 5 | `/fr/concours/famille/crmef` | **Seize** spécialités — onze au secondaire, cinq au primaire bilingue — et trois épreuves avec coefficients 8, 12, 20 |
| 6 | Coefficients affichés | Vérifier que la spécialité pèse 20 et les sciences de l'éducation 8 — l'inverse de ce que suggérait la maquette v1 |
| 7 | Session 2026 | Mention « dates non confirmées » visible |
| 8 | `/fr/concours/famille/crmef/langue-francaise-secondaire` | Bouton de correction présent — c'est la seule spécialité **ouverte** du pilote |
| 9 | `/fr/concours/famille/crmef/mathematiques-secondaire` | **Aucun** bouton de diagnostic — spécialité en liste d'attente |
| 9 bis | `/fr/concours/famille/crmef/langue-francaise-primaire-bilingue` | Même nom que la ligne 8, **cycle différent, fiche différente** — en liste d'attente |
| 10 | `/fr/concours/famille/inexistante` | Page 404, pas 403 |
| 11 | `/ar/concours/famille/crmef` | Interface arabe, mise en page inversée, noms de domaines traduits |
| 12 | Code source de `/fr/concours/famille/crmef` | Contenu présent sans JavaScript ; `hreflang` réciproque fr/ar |
| 13 | Onglet réseau, parcours complet | Aucun appel direct vers `localhost:8000` |
| 14 | Fenêtre à 320 px | Aucun débordement horizontal |
| 15 | Navigation au clavier | Repère de focus visible sur chaque lien et bouton |

Consigner le résultat de chaque ligne, avec les écarts. La ligne 6 est la plus
importante : c'est la correction structurelle du PAS-4.1 portée à l'écran.

## Le slug d'une spécialité porte son parcours — depuis le 24 août 2026

Les adresses des lignes 5, 8 et 9 ont changé, et c'est la même cause.

Une spécialité pend d'un PARCOURS, pas d'une famille : « langue française »
existe légitimement deux fois sous CRMEF — au primaire bilingue et au secondaire.
Tant que le slug ne portait que la matière, les deux fiches partageaient une
adresse, et la route en servait une au hasard. Sur la préproduction, elle rendait
systématiquement le primaire en liste d'attente : **la seule spécialité ouverte
du pilote n'était atteignable par aucune URL**, et un candidat qui cliquait sur
la carte marquée « Ouvert » lisait « pas encore ouverte ».

Le slug porte donc son parcours (`langue-francaise-secondaire`), et l'unicité
`(famille, slug)` est revenue. Voir DET-80 et DET-101.

**Ce que cette recette doit vérifier en plus, et c'est la ligne 9 bis :** deux
cartes peuvent porter le même nom et ne se distinguer que par leur cycle. Elles
doivent mener à deux fiches différentes. Si elles mènent à la même, le défaut est
de retour.
