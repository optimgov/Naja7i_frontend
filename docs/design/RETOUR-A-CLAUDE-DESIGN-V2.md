# Retour à Claude — revue contradictoire du frontend public Naja7i v2

**Date :** 9 août 2026  
**Projet :** Naja7i — plateforme marocaine de préparation aux concours  
**Document examiné :** maquettes HTML de la zone publique v2  
**Objet de ce retour :** consolider les choix déjà faits en distinguant ce qui est démontré par la maquette, ce qui relève d'une hypothèse produit et ce qui doit encore être testé.

---

## 1. Rappel de l'objectif produit

Le frontend doit répondre simultanément à deux besoins :

1. **Mettre la préparation aux concours au premier plan** : diagnostic, compréhension des erreurs, référentiel officiel, entraînement ciblé et progression.
2. **Publier les opportunités de concours et d'emploi public** afin de répondre aux recherches des candidats, développer le trafic organique et orienter les visiteurs vers une préparation Naja7i lorsqu'elle existe.

La boucle produit recherchée est la suivante :

```text
Recherche ou opportunité
        ↓
Information officielle et vérifiée
        ↓
Fiche concours / parcours / spécialité
        ↓
Démonstration de la méthode Naja7i
        ↓
Diagnostic
        ↓
Compte candidat et préparation
```

L'objectif n'est donc pas de juxtaposer un site d'annonces et une banque de QCM. Les opportunités doivent alimenter le produit de préparation.

---

## 2. Éléments effectivement constatés dans le HTML

Les constats ci-dessous sont directement vérifiables dans les 552 lignes de la maquette transmise :

- « Préparation » est le premier élément de la navigation.
- Le héros annonce explicitement la « préparation aux concours marocains ».
- La promesse principale est : « Comprendre pourquoi vous vous êtes trompé ».
- Une correction détaillée compare une réponse fausse et la bonne réponse, avec explication de la cause.
- Le bouton principal est « Voir une correction complète ».
- « Parcourir les concours ouverts » est présenté comme action secondaire.
- Trois familles d'entrée sont proposées : métiers de l'éducation, post-baccalauréat et fonction publique.
- La fiche CRMEF Français présente trois épreuves distinctes, avec coefficients 8, 12 et 20.
- Les durées, langues et poids par domaine sont affichés avec indication de la source officielle.
- La fiche spécialité propose un diagnostic d'environ sept minutes.
- Les opportunités indiquent si une préparation Naja7i est disponible.
- Une action « Me prévenir » est proposée sur chaque opportunité.
- Les données fictives sont signalées par un bandeau « Données de démonstration ».
- Une version arabe est présente avec `lang="ar"` et `dir="rtl"`.
- Le CSS utilise majoritairement des propriétés logiques adaptées au RTL.

Les coefficients, durées et matrices CRMEF sont cohérents avec le référentiel PAS-4.1 chargé dans le backend et couvert par les tests.

---

## 3. Ce que la maquette ne démontre pas encore

Le fichier reste une maquette statique :

- les liens pointent vers `#` ;
- les filtres ne filtrent aucune donnée ;
- la recherche ne fonctionne pas ;
- les changements de vue ne fonctionnent pas ;
- « Me prévenir » ne déclenche aucun parcours ;
- aucune donnée ne vient du backend ;
- aucun parcours complet vers le diagnostic n'est implémenté ;
- aucune page individuelle d'opportunité n'est matérialisée ;
- aucune mesure d'audience ou de conversion n'est disponible.

En conséquence, les affirmations suivantes ne doivent pas être considérées comme validées :

- les visiteurs comprennent immédiatement la proposition de valeur ;
- le CTA actuel est le plus performant ;
- les opportunités augmenteront effectivement le trafic ;
- « Me prévenir » est l'action la plus demandée ;
- les trois familles correspondent au vocabulaire spontané des candidats ;
- la conception est optimale sur mobile ;
- l'accessibilité et les contrastes sont conformes ;
- les pages seront correctement indexées et positionnées par Google.

---

## 4. Choix que nous proposons de conserver

Ces choix paraissent suffisamment solides pour servir de base à la suite :

### 4.1 Préparation comme promesse principale

La préparation doit rester dominante dans le héros, dans la navigation et dans le parcours de conversion. Les opportunités constituent un canal d'acquisition et non un produit concurrent.

### 4.2 Démonstration concrète de la correction

La comparaison entre réponse fausse, cause de l'erreur et bonne réponse rend la proposition Naja7i tangible. Elle est plus persuasive qu'une liste générique de fonctionnalités.

### 4.3 Référentiel structuré par épreuve

La fiche spécialité doit conserver les trois épreuves séparées et leurs données officielles. Il ne faut pas revenir à une taxonomie fusionnée par « piliers ».

### 4.4 Passerelle entre opportunité et préparation

Chaque opportunité doit indiquer clairement :

- la préparation correspondante lorsqu'elle existe ;
- son absence lorsqu'elle n'existe pas encore ;
- la possibilité d'être averti lorsque cette préparation ouvre.

### 4.5 Transparence sur les sources

Les informations non établies par une source officielle doivent rester nulles ou explicitement inconnues. Aucune date, aucun coefficient et aucun barème ne doivent être déduits ou inventés.

### 4.6 Bilinguisme et RTL natifs

Le français et l'arabe doivent rester deux versions de premier rang, fondées sur une même structure et des propriétés CSS logiques.

---

## 5. Points à renforcer avant l'implémentation finale

### 5.1 Montrer le parcours complet de préparation

La maquette démontre très bien la correction d'une question, mais elle ne montre pas encore suffisamment ce qui suit :

```text
Diagnostic
→ lacunes par épreuve et domaine
→ plan de préparation
→ entraînement ciblé
→ suivi de progression
```

Une section courte, en trois ou quatre étapes, devrait rendre ce parcours visible sur l'accueil.

### 5.2 Clarifier le rôle du CTA principal

Le CTA « Voir une correction complète » est cohérent avec une stratégie de démonstration sans engagement. Il ne faut cependant pas supposer qu'il est meilleur que les variantes suivantes :

- « Essayer une question corrigée » ;
- « Tester mon niveau » ;
- « Commencer mon diagnostic ».

Le choix doit dépendre de l'écran ouvert après le clic et, idéalement, être validé par un test utilisateur ou un test comparatif après lancement.

### 5.3 Créer des pages indexables, pas seulement un tapis filtrable

La liste des opportunités est utile pour explorer, mais le trafic organique nécessitera aussi des URL permanentes :

```text
/fr/opportunites/{slug}
/fr/opportunites/education
/fr/opportunites/post-baccalaureat
/fr/opportunites/fonction-publique
/fr/concours/crmef
/fr/concours/crmef/francais
```

Chaque page d'opportunité devrait présenter la source officielle, la date de dernière vérification, les échéances, les conditions, les documents associés et la préparation liée.

### 5.4 Préciser « Me prévenir »

Il faut définir ce que l'inscription couvre :

- rappel avant clôture ;
- nouvelle annonce du même concours ;
- convocations ;
- résultats ;
- ouverture d'une préparation Naja7i.

Le premier geste devrait rester léger et ne pas nécessairement imposer immédiatement la création d'un compte complet.

### 5.5 Distinguer strictement démonstration et production

Les données telles que nombre de postes, échéance, date d'écrit ou nombre de concours ouverts ne doivent apparaître en production que si elles sont liées à une source, un statut de publication et une date de vérification.

---

## 6. Questions adressées à Claude

Merci de répondre point par point, en distinguant **décision documentée**, **hypothèse**, et **élément déjà testé**.

1. Quelle recherche utilisateur ou décision antérieure justifie précisément le CTA « Voir une correction complète » ?
2. Quel écran ou parcours était prévu après ce clic ?
3. Où le parcours diagnostic → plan → entraînement → progression devait-il être expliqué ?
4. Les trois familles « métiers de l'éducation / post-baccalauréat / fonction publique » proviennent-elles d'un vocabulaire validé ou d'un choix de conception ?
5. Quelle architecture d'URL était prévue pour les pages individuelles de concours et d'opportunités ?
6. Le tapis des opportunités était-il conçu comme une page d'exploration uniquement, ou également comme le principal support SEO ?
7. Que devait précisément faire « Me prévenir » et quelles notifications étaient envisagées ?
8. Quelle preuve soutient l'affirmation selon laquelle « Me prévenir » serait l'action la plus demandée et la meilleure capture d'adresse du site ?
9. Quels tests mobiles, RTL, d'accessibilité et de contraste ont réellement été exécutés ?
10. Quelles données du prototype étaient déjà reliées au backend et lesquelles étaient uniquement démonstratives ?
11. Quels indicateurs étaient prévus pour mesurer séparément acquisition, activation et conversion ?
12. Parmi les recommandations de la section 5, lesquelles contredisent une décision déjà arbitrée et documentée ? Merci de citer la décision ou le document concerné.

---

## 7. Livrable attendu de Claude

Nous attendons une réponse qui ne défende pas la maquette par principe et ne la remette pas non plus à zéro. Elle doit produire :

1. la liste des choix déjà arbitrés, avec leurs sources ;
2. la liste des hypothèses encore non validées ;
3. les corrections acceptées ou refusées, avec justification ;
4. une architecture finale des pages publiques ;
5. le parcours exact depuis une opportunité jusqu'à la préparation ;
6. le parcours exact depuis le héros jusqu'au diagnostic ;
7. une proposition de priorités pour l'implémentation Nuxt ;
8. les critères de recette fonctionnelle, SEO, mobile, accessibilité et RTL.

Le but est de transformer une maquette cohérente en décision produit vérifiable, sans confondre qualité visuelle, intuition de conception et résultat utilisateur démontré.
