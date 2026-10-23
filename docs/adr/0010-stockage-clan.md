# ADR-0010 - Le Clan utilise un stockage classique, dans son propre schéma

- Statut : accepté
- Date : 2026-10-23

## Contexte

- Le Clan regroupe des joueurs : il conserve les clans, leurs membres et leurs rôles, les
  demandes d'adhésion, les messages du chat, et l'or du trésor avec ses dons et ses
  distributions.
- Ces données sont un état courant plus qu'un historique : un membre qui part disparaît du
  clan, une demande d'adhésion expire au bout de sept jours, un message est supprimé au bout
  de trente jours, et un clan dissous disparaît avec ses membres et ses messages.
- Presque toutes ces données sont personnelles, et l'effacement d'un compte doit les
  supprimer (TD10). Le journal d'événements est en ajout seul, et sa réécriture est réservée
  aux seuls champs de nom (ADR-0008).
- Aucun autre module ne lit les données du Clan : elles n'ont pas de valeur pour le
  Classement ni pour les autres projections.
- Deux règles de la fiche de cadrage doivent tenir même en cas de requêtes simultanées : un
  joueur appartient à au plus un clan, et le solde du trésor ne devient jamais négatif.

## Décision

- Le Clan n'utilise pas l'Event Sourcing : ses données sont rangées dans six tables
  ordinaires du schéma `clan` (`clans`, `members`, `requests`, `messages`, `donations`,
  `distributions`), créées par la migration `0013_clan`.
- Le domaine applique ses règles à l'état courant d'un clan, lu dans ces tables, sous la
  forme de fonctions pures (`domain/clan.ts`, `domain/chat.ts`, `domain/treasury.ts`).
- Les règles qui doivent résister aux requêtes simultanées sont aussi garanties par la base :
  la clé primaire de `members` est le joueur, le nom et le tag d'un clan sont uniques, et le
  débit du trésor est une seule instruction conditionnée par le solde
  (`treasury >= montant`).
- La dissolution d'un clan supprime en cascade ses membres, ses demandes et ses messages.
  Les dons ne sont pas reliés au clan par une clé étrangère : un don en attente survit à la
  dissolution, le temps d'être remboursé (ADR-0011).
- Les durées de conservation des demandes et des messages sont appliquées à chaque lecture,
  et une fois par jour par la tâche quotidienne `clan` de `/api/cron/daily`.

## Conséquences

### Positives

- L'effacement d'un compte est une suppression de lignes, sans réécriture du journal ;
  le module n'ajoute aucune exception à l'ajout seul du journal.
- La règle « un seul clan par joueur » et le solde positif du trésor sont garantis par la
  base, et non seulement par le code : deux acceptations ou deux distributions simultanées
  ne peuvent pas les enfreindre.
- Le module est plus simple qu'un module fondé sur des événements : ni versions, ni
  concurrence optimiste, ni projection pour lire l'état d'un clan.
- La Taverne avait déjà retenu ce modèle (ADR-0008) : le Clan en reprend les adaptateurs,
  le canal temps réel et la tâche quotidienne.

### Négatives

- L'historique d'un clan n'est pas conservé : on ne peut pas savoir qui en était membre
  hier, ni reconstruire le trésor à partir de ses mouvements.
- Le plafond de vingt membres n'est vérifié que par le code : deux acceptations simultanées
  dans un clan de dix-neuf membres pourraient le dépasser d'un membre.
- Les tables `donations` et `distributions` grandissent avec chaque mouvement du trésor ;
  seul l'effacement d'un compte en supprime des lignes.
- Un futur module qui voudrait réagir à la vie des clans (une quête de clan, un classement)
  ne disposera d'aucun événement à lire : il faudra en publier.

## Alternatives écartées

- **L'Event Sourcing, selon le modèle decider** : rejeté, car l'historique des clans n'a
  pas de valeur de jeu, aucun autre module ne lit ces événements, et des données
  personnelles destinées à disparaître iraient contre l'ajout seul du journal (TD10).
- **Des tables dans le schéma public, ou dans celui d'un autre module** : rejetées, car la
  fonction d'aptitude du TD11 exige un schéma par propriétaire, et la migration ne doit
  modifier que les tables du module.
- **Une colonne JSON des membres dans la table des clans** : rejetée, car l'unicité de
  l'appartenance d'un joueur ne pourrait plus être garantie par une contrainte de la base.
- **Le verrouillage de la ligne du clan pendant chaque acceptation** : écarté pour le
  plafond de membres, car le dépassement possible est d'un membre et le risque est faible ;
  il est consigné comme dette technique.

## Réexamen

La décision devra être réexaminée si une fonctionnalité a besoin de l'historique d'un clan,
par exemple des quêtes de clan ou un classement des clans : le Clan devrait alors publier des
événements, ou une partie de ses données passer dans le journal.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des
consignes fournies et des ADR existantes. Le contenu a été relu pour vérifier
la couverture des exigences relatives au stockage du Clan, à son schéma et à
la garantie de ses règles en cas de requêtes simultanées.
