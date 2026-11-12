# Octopus Energy España pour Gladys Assistant

Intégration non officielle, sans lien avec Octopus Energy, pour les clients
d'**Octopus Energy España**. Elle lit votre compte par l'API GraphQL Kraken
officielle d'Octopus España (`api.oees-kraken.energy`) et donne à Gladys :

- un appareil par point de fourniture d'électricité (CUPS) : le prix du kWh
  actuel et le suivant, les prix des trois périodes 2.0TD (taxes comprises),
  la compensation des excédents par kWh, la consommation horaire pour le
  suivi énergétique ;
- un appareil pour le compte : solde du compte électricité, Solar Wallet,
  montant de la dernière facture ;
- le modèle de contrat d'énergie **Octopus Energy España électricité**.

**Lecture seule** : rien n'est jamais modifié sur votre compte ; la seule
requête qui n'est pas une lecture est la connexion. **Elle n'a jamais été testée avec un vrai compte Octopus España pour l'instant** : construite d'après l'API publiée
et les requêtes de ha-octopus-spain.

## Mise en route

1. Installez l'intégration depuis le store de Gladys, ouvrez sa configuration.
2. Saisissez l'adresse e-mail et le mot de passe du site d'Octopus, ou une clé
   d'API de votre compte si Octopus vous en a donné une (utilisée seule si
   elle est saisie). Kraken a déprécié la connexion par e-mail en 2026 : si
   Octopus la retire, le statut le dit. Le mot de passe et la clé d'API sont
   gardés par Gladys dans sa base, jamais réaffichés, envoyés seulement à
   Octopus Energy España.
3. Numéro de compte : seulement si votre connexion a plusieurs comptes (vide :
   le premier).
4. Zone de la fourniture : péninsule et Baléares (par défaut), Canaries ou
   Ceuta et Melilla. Elle fixe les heures des périodes.
5. Enregistrez, puis **Tester la connexion** (au plus une fois par minute).
6. Dans la Découverte, ajoutez les appareils voulus.

## Appareils

**Octopus électricité (CUPS …XXXX)**, les 4 derniers caractères du CUPS :

| Fonctionnalité                     | Unité   | Remarque                                             |
| ---------------------------------- | ------- | ---------------------------------------------------- |
| Prix du kWh actuel                 | EUR/kWh | le prix de la période en cours, taxes comprises      |
| Prochain prix du kWh               | EUR/kWh | le prochain prix différent dans les 2 jours          |
| Prix du kWh P1 (punta)             | EUR/kWh | taxes comprises                                      |
| Prix du kWh P2 (llano)             | EUR/kWh | taxes comprises                                      |
| Prix du kWh P3 (valle)             | EUR/kWh | taxes comprises                                      |
| Compensation des excédents par kWh | EUR/kWh | le prix de l'énergie que vous injectez               |
| Consommation (30 min)              | kWh     | chaque heure lue partagée en deux demi-heures égales |

**Compte Octopus España** : solde du compte électricité, Solar Wallet,
montant de la dernière facture (EUR, tels que l'API les donne). Une valeur que
l'API ne donne pas reste vide, jamais 0.

Les prix sont republiés à chaque quart d'heure depuis ce qui est connu (sans
requête), et plus du tout s'ils ont été lus il y a plus de 6 heures.

## Les périodes 2.0TD

| Jours                                          | Péninsule, Baléares et Canaries (heure locale)     | Ceuta et Melilla                                   |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Du lundi au vendredi                           | P1 10-14 et 18-22, P2 8-10, 14-18 et 22-24, P3 0-8 | P1 11-15 et 19-23, P2 8-11, 15-19 et 23-24, P3 0-8 |
| Samedi, dimanche, fêtes nationales à date fixe | P3 toute la journée                                | P3 toute la journée                                |

Fêtes nationales à date fixe : 1er et 6 janvier, 1er mai, 15 août,
12 octobre, 1er novembre, 6, 8 et 25 décembre (circulaire CNMC 3/2020, état
de 2026-11). Les fêtes mobiles (Vendredi saint) et régionales sont des jours
ordinaires en 2.0TD. Un produit au même prix dans les trois périodes coûte
le même prix à toute heure.

## Rythme

- Le compte (points de fourniture, prix, soldes, dernière facture) : toutes
  les heures.
- La consommation du point de fourniture créé : toutes les 6 heures sur les
  4 derniers jours, et sur 14 jours une fois par jour après 6 h et pour un
  nouvel appareil (le distributeur envoie les relevés avec un jour de retard
  ou plus).
- Une requête à la fois, à 2 secondes d'écart. L'heure de chaque lecture est
  gardée dans `/data` avant la requête : un redémarrage ne lit jamais plus tôt.

## Le contrat d'énergie

Créez un contrat depuis le modèle **Octopus Energy España électricité** :

- **4 derniers caractères du CUPS** : vide avec un seul point de fourniture ;
  obligatoires avec plusieurs (une valeur vide ou ambiguë laisse le contrat
  sans prix, jamais deviné) ;
- **Frais fixes par mois** : le terme de puissance et la location du compteur
  de votre facture, taxes comprises (l'API ne les donne pas).

Chaque demi-heure est tarifée par l'intégration au prix de sa période, taxes
comprises. L'API donne les prix en vigueur, jamais leurs dates : à chaque
lecture horaire, l'intégration garde les prix des 2 heures suivantes (gardés
40 jours). Donc :

- faites commencer le contrat le jour de l'installation de l'intégration :
  une demi-heure antérieure n'a pas de prix ;
- un Gladys arrêté plus de 2 heures laisse les demi-heures du trou sans prix ;
- un changement de prix est vu à la lecture horaire suivante.

Une demi-heure sans prix n'est jamais comptée 0 : la requête échoue et Gladys
réessaie plus tard.

## Statut et erreurs

| Statut                                                         | Sens                                                                                                                                                                                    | Ce qui se passe                                                                                                                           |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Octopus a refusé la connexion (KT-CT-1138, 1134 ou 1135)       | connexion refusée : e-mail, mot de passe ou clé d'API faux (1134 et 1135 sont documentés pour les jetons de rafraîchissement ; répondus à cette connexion, ils sont pris pour un refus) | aucune requête tant que vous ne changez pas les identifiants ou que Tester ne réussit pas (un autre numéro de compte seul ne le lève pas) |
| L'accès à l'API n'est pas activé (KT-CT-11334)                 | Octopus a désactivé l'accès à l'API pour cet utilisateur                                                                                                                                | idem                                                                                                                                      |
| Octopus n'accepte plus la connexion par e-mail et mot de passe | le schéma refuse ces champs, ou KT-CT-1113                                                                                                                                              | pause d'1 heure, doublée jusqu'à 6 heures ; levée par une clé d'API                                                                       |
| Octopus bloque la connexion pour le moment (KT-CT-1136)        | blocage passager, vu avec des identifiants valides                                                                                                                                      | pause d'1 heure, doublée jusqu'à 6 heures                                                                                                 |
| Octopus a demandé de ralentir                                  | HTTP 429 ou KT-CT-1199                                                                                                                                                                  | pause de Retry-After ou 15 minutes, doublée jusqu'à 6 heures                                                                              |
| Octopus a un problème                                          | HTTP 5xx ou KT-CT-7899                                                                                                                                                                  | pause de 5 minutes, doublée jusqu'à 6 heures                                                                                              |
| Octopus n'a pas pu être lu                                     | réseau, délai, réponse illisible ou partielle, requête refusée                                                                                                                          | nouvel essai après 5, 10, 20, 40 puis toutes les 60 minutes                                                                               |

Un 401 ou 403 répondu à une requête (pas à la connexion) n'est jamais pris
pour un mot de passe refusé : une nouvelle connexion, puis une erreur
passagère. Les pauses et le refus sont gardés dans `/data` (le refus comme
8 bits d'une empreinte salée des identifiants, jamais les identifiants).

**La nouvelle connexion d'Octopus.** Si le site accepte votre mot de passe
mais que l'intégration le dit refusé, votre compte utilise peut-être la
nouvelle connexion : une clé d'API du compte fonctionne encore (demandez-en
une à Octopus).

Autres remarques du statut : prix non donnés taxes comprises (ni publiés ni
utilisés), plusieurs points de fourniture (la consommation n'est pas
publiée), soldes ou consommation non lus (les prix continuent).

## Ce que contient `/data`

`/data/octopus-spain.json` : l'heure des dernières lectures, la pause, le
refus (8 bits d'une empreinte salée), les points de fourniture vus (8 au plus :
empreinte à clé, 4 derniers caractères, dernière fois vu), l'empreinte à clé
du compte et les prix des 40 derniers jours. Jamais l'adresse e-mail, le mot
de passe, un jeton, la clé des identifiants, le numéro de compte ni un CUPS
entier.

## Limites

- Électricité seulement, consommation seulement : les relevés d'injection
  (excédents) ne sont pas lus en v1.
- La consommation n'est publiée que pour un compte à un seul point de
  fourniture : les relevés de l'API ne disent pas à quel point ils
  appartiennent.
- Seulement les prix taxes comprises (`variableTermWithTaxes`) ; un produit
  indexé sans ces trois prix n'a pas de prix dans Gladys.
- Le terme de puissance et la puissance souscrite ne sont pas lus : saisissez
  les frais fixes dans le contrat.
- Les heures du statut sont celles de Madrid.

## Crédits

Les requêtes GraphQL sont adaptées de
[ha-octopus-spain](https://github.com/MiguelAngelLV/ha-octopus-spain) (MIT,
Miguel Ángel López Vicente). Apache-2.0.
