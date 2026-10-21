# ADR-0002 - l'Event Sourcing comme mode de persistance du Village.

- Statut : accepté
- Date : 2026-10-19

## Contexte

- La nature des données du Village : un état qui évolue par des actions successives du joueur.
- Les besoins annoncés pour la suite du projet : diffusion des changements en temps réel (TD5), construction de vues de lecture à partir de l'activité des joueurs (TD8).
- La contrainte de l'hébergement : plusieurs instances de l'application peuvent traiter simultanément des requêtes pour un même village.

## Décision

- L'état du village n'est pas stocké : il est reconstruit en rejouant ses événements.
- Les événements sont enregistrés dans un journal générique de la plateforme (`platform.events`), un flux par village, nommé `village-<joueur>`.

- Les écritures concurrentes sont détectées par la contrainte d'unicité sur le flux et la version, et la commande est rejouée au plus trois fois.
- Un événement porte toutes les informations nécessaires à son application, comme le coût payé pour une amélioration.

## Conséquences

### Positives

- L'historique complet du village est conservé : on sait à tout moment comment le joueur en est arrivé là, et on peut reconstruire son état à n'importe quel moment passé.
- Les événements enregistrés peuvent être diffusés tels quels aux navigateurs, ce qui prépare le temps réel (TD5) sans changer le stockage.
- De nouvelles vues de lecture pourront être construites plus tard en rejouant le journal, y compris pour les actions déjà faites avant leur création (TD8).
- Deux écritures simultanées sur un même village ne peuvent pas s'écraser : la contrainte d'unicité sur le flux et la version en refuse une, qui est rejouée sur l'état à jour.
- Le domaine reste pur : il reçoit un état, rend des événements, et ne sait rien de la base de données.

### Négatives

- Un événement enregistré ne peut plus être modifié. Si sa structure doit évoluer, il faut garder la capacité de lire les anciennes versions, ou les convertir à la lecture, et le code de l'application doit les supporter pour toujours.
- La lecture d'un village coûte plus cher qu'une simple ligne : il faut relire et rejouer tous ses événements, et ce coût augmente avec l'âge du village.
- Une lecture qui traverse plusieurs villages (par exemple un classement) ne peut pas se faire par une requête SQL simple sur un état : il faut rejouer plusieurs flux ou construire une vue à part.
- Le modèle est moins habituel qu'une table d'état : il demande plus de code (journal, rejeu, nouvel essai) et il est plus difficile à comprendre pour quelqu'un qui découvre le projet.

## Alternatives écartées

- **Stocker l'état du village dans une table propre au module** : plus simple à lire et à requêter, mais l'historique des actions serait perdu, et il faudrait ajouter un mécanisme à part pour diffuser les changements en temps réel et pour construire les futures vues de lecture.
- **Verrouillage pessimiste (`SELECT ... FOR UPDATE`)** : chaque commande bloquerait le village le temps de son traitement. Avec plusieurs instances sans serveur, une instance lente ou interrompue ferait attendre les autres, alors que les conflits sur un même village restent rares : le nouvel essai optimiste coûte moins cher.
- **Un journal propre au module Village** : chaque module aurait dû réécrire son propre stockage d'événements ; un journal générique dans la plateforme sert aussi au Donjon et au temps réel.

## Réexamen

La décision devra être réexaminée si le rejeu d'un village devient trop long parce qu'il a accumulé trop d'événements ; il faudrait alors ajouter des instantanés (snapshots) de son état.

Elle devra aussi être revue si les conflits d'écriture sur un même village deviennent fréquents et que le nouvel essai échoue souvent après trois tentatives.

## Usage de l'IA générative

Un assistant IA a été utilisé pour compléter les conséquences, les alternatives et le réexamen à partir des consignes du TD et du code. Le contenu a été relu et vérifié dans
[`event-store.ts`](../../src/platform/event-store/event-store.ts),
[`retry.ts`](../../src/platform/event-store/retry.ts)
et
[`event-store-village-repository.ts`](../../src/modules/realm/infrastructure/event-store-village-repository.ts).
