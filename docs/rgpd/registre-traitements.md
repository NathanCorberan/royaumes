# Registre des traitements de données personnelles

Ce registre, prévu par l'article 30 du RGPD, recense les traitements de données personnelles
réalisés par Royaumes. Il est tenu à jour à chaque évolution du jeu qui ajoute, modifie ou
supprime une donnée personnelle, dans le même commit que cette évolution.

- Responsable du traitement : Nathan Corberan, ADRESSE_DE_CONTACT.
- Date de dernière mise à jour : 2026-10-21.

## Sous-traitants

| Sous-traitant | Rôle | Localisation des données | Garanties à vérifier |
| --- | --- | --- | --- |
| Vercel | Hébergement de l'application, journaux techniques | Région de Francfort (fra1) pour les fonctions ; les traitements principaux de Vercel ont lieu aux États-Unis | Un accord de traitement des données (DPA) est intégré aux conditions des offres Pro et Enterprise ; l'offre Hobby, réservée à un usage personnel, n'en bénéficie pas. Les transferts hors de l'Union européenne sont encadrés par les clauses contractuelles types de 2021. |
| Neon | Hébergement de la base de données | Région AWS de Francfort, choisie à la création du projet | Un accord de traitement des données (DPA) est inclus dans les conditions d'utilisation de Neon. Neon appartient à Databricks, et certains de ses sous-traitants sont situés aux États-Unis : les transferts reposent sur le cadre de protection des données UE–États-Unis (Data Privacy Framework). |

## Traitements

| N° | Traitement | Finalité | Données | Personnes concernées | Base légale | Durée de conservation | Emplacement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Comptes des joueurs | Permettre l'accès au jeu | Nom, adresse électronique, empreinte du mot de passe, date d'inscription | Joueurs | Exécution du contrat (conditions d'utilisation du jeu) | Jusqu'à la suppression du compte | `identity.user`, `identity.account`, `identity.verification` |
| T2 | Sessions | Maintenir la connexion ; limiter les tentatives de connexion | Adresse IP, navigateur, dates de la session | Joueurs | Exécution du contrat ; intérêt légitime (sécurité) | Jusqu'à l'expiration de la session, ou la suppression du compte | `identity.session` |
| T3 | Activité de jeu | Faire fonctionner le Village, le Donjon, le Marché et le Classement | Identifiant, nom du joueur, nom du village, actions de jeu | Joueurs | Exécution du contrat | Jusqu'à la suppression du compte ; ensuite, identifiant pseudonymisé et noms remplacés (ADR 0008) | `platform.events`, `platform.outbox`, `ranking`, `dungeon`, `market` |
| T4 | Messagerie de la Taverne | Permettre aux joueurs de discuter | Contenu des messages, auteur, date | Joueurs | Exécution du contrat | Trente jours, ou jusqu'à la suppression du compte | `tavern.messages` |
| T5 | Présence dans la Taverne | Indiquer les joueurs présents | Identifiant, nom, date du dernier signal | Joueurs | Exécution du contrat | Deux minutes après le dernier signal | `tavern.presence` |
| T6 | Registre des effacements | Démontrer la réalisation des effacements | Date de l'effacement, nombre d'événements réécrits ; aucune donnée sur le joueur | Aucune personne identifiable | Obligation légale (responsabilité, article 5) | Illimitée | `platform.erasures` |
| T7 | Journaux techniques | Diagnostiquer les erreurs, assurer la sécurité | Adresse IP, adresses des requêtes, messages d'erreur | Joueurs, visiteurs | Intérêt légitime (sécurité, maintenance) | Durée fixée par l'hébergeur : 1 heure avec l'offre Hobby, 1 jour avec l'offre Pro, 30 jours avec l'option Observability Plus | Vercel |

## Droits des personnes

| Droit | Mise en œuvre |
| --- | --- |
| Accès et portabilité (articles 15 et 20) | Page « Mes données » : export JSON de toutes les données du joueur |
| Effacement (article 17) | Page « Mes données » : suppression du compte, effective dans tous les modules |
| Rectification (article 16) | Non mis en œuvre : le nom d'un joueur ne peut pas encore être modifié |
