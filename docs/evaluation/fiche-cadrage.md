# Fiche de cadrage : Le Clan

- Auteur : Nathan Corberan
- Date : 2026-10-21
- Nom technique du module : `clan`

## L'idée

Les joueurs se regroupent en clans, sur le modèle du jeu Idle Clans. Un joueur fonde un clan, ou demande à en rejoindre un ; le chef et ses officiers gèrent les membres. Les membres d'un clan disposent d'un chat qui leur est réservé, et d'un trésor commun alimenté par leurs dons d'or, que le chef redistribue. Le clan donne au jeu une dimension collective : on joue avec et pour les autres.

## Les règles métier

1. Le nom d'un clan comporte de 3 à 24 caractères, et son tag de 2 à 4 lettres majuscules ; le nom et le tag sont uniques.
2. Un joueur appartient à au plus un clan à la fois ; le fondateur d'un clan en devient le chef.
3. Un clan compte au plus 20 membres.
4. Un joueur sans clan demande à rejoindre un clan ; le chef ou un officier accepte ou refuse la demande. Une demande sans réponse expire au bout de 7 jours.
5. Le chef nomme ou rétrograde les officiers, et peut transmettre son rôle de chef à un autre membre.
6. Le chef exclut n'importe quel membre ; un officier n'exclut que de simples membres.
7. Le chef ne peut pas quitter son clan sans avoir transmis son rôle, sauf s'il en est le dernier membre : le clan est alors dissous.
8. Seuls les membres d'un clan lisent et écrivent dans son chat ; un message comporte de 1 à 280 caractères, un membre publie au plus 5 messages par 30 secondes, et un message est conservé 30 jours.
9. Un membre donne de l'or au trésor du clan : l'or est prélevé dans son village, et n'est crédité au trésor que si le prélèvement réussit.
10. Le chef distribue de l'or du trésor à un membre ; le solde du trésor ne devient jamais négatif.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Voir son clan (membres, rôles, trésor) | Lecture | `GET /api/clan/me` |
| Parcourir les clans | Lecture | `GET /api/clan/clans` |
| Fonder un clan | Commande | `POST /api/clan/clans` |
| Demander à rejoindre un clan | Commande | `POST /api/clan/clans/:clanId/requests` |
| Voir les demandes en attente | Lecture | `GET /api/clan/requests` |
| Accepter ou refuser une demande | Commande | `POST /api/clan/requests/:requestId/accept` et `/refuse` |
| Nommer ou rétrograder un officier | Commande | `POST /api/clan/members/:playerId/promote` et `/demote` |
| Transmettre le rôle de chef | Commande | `POST /api/clan/members/:playerId/transfer-leadership` |
| Exclure un membre | Commande | `POST /api/clan/members/:playerId/kick` |
| Quitter son clan | Commande | `POST /api/clan/leave` |
| Lire le chat du clan | Lecture | `GET /api/clan/messages` |
| Écrire dans le chat du clan | Commande | `POST /api/clan/messages` |
| Donner de l'or au trésor | Commande | `POST /api/clan/treasury/donations` |
| Distribuer de l'or du trésor | Commande | `POST /api/clan/treasury/distributions` |

## Le stockage envisagé

Des tables classiques, rangées dans le schéma `clan` : clans, membres, demandes d'adhésion, messages du chat, dons et distributions. Les données du clan sont un état courant plus qu'un historique : un membre qui part disparaît du clan, les messages sont effacés au bout de 30 jours, et l'effacement d'un compte doit supprimer ses données. Ce sont des données destinées à disparaître, qui se prêtent mal à l'Event Sourcing (TD10).

## La communication avec les modules existants

Le Clan communique avec le Village par des messages de la boîte d'envoi, comme le Marché au TD9 :

- un don envoie au Village un message `realm.withdraw`, avec une réponse attendue sur un sujet du Clan ; l'or est crédité au trésor si le prélèvement réussit, et le don est annulé s'il est refusé ;
- une distribution envoie au Village un message `realm.deposit`, après avoir débité le trésor.

Le Village n'est pas modifié : le Clan utilise les sujets existants de son langage publié.

## Les données personnelles

- l'appartenance du joueur à un clan : son identifiant, son nom affiché, son rôle et sa date d'arrivée ;
- ses demandes d'adhésion ;
- ses messages dans le chat du clan ;
- ses dons au trésor et les distributions qu'il a reçues.

## Les bonus visés

1. B1 : le chat du clan en temps réel, sur un canal réservé aux membres du clan.
2. B5 : la saga du don, avec compensation : si le clan est dissous pendant le prélèvement, l'or est reversé au village du donateur.
3. B2 : l'expiration paresseuse des demandes d'adhésion au bout de 7 jours.
4. B4 : une projection « classement des clans », tenue à partir des dons au trésor.
5. B6 : les quêtes de clan, alimentées par les événements du Donjon : le Clan communique alors avec deux modules existants.
