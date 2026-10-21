# ADR-0006 - Modèles de lecture séparés du modèle d'écriture, tenus à jour par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

- Certaines lectures traversent plusieurs flux : le classement des joueurs, qui
  dépend des événements de tous les villages et de toutes les expéditions, et la
  liste des expéditions ouvertes. Calculées par rejeu, elles relisent à chaque
  consultation l'historique de tout le jeu, et leur coût croît avec lui
  (dette DT-005).
- L'hébergement ne permet aucun processus permanent ni tâche de fond fiable
  (ADR-0004). Aucun programme ne peut donc suivre le journal en continu pour
  tenir ces lectures à jour.
- Le journal attribue à chaque événement une position globale, croissante mais
  non continue (ADR-0002) : une insertion refusée, ou encore en cours, laisse
  une position manquante.
- Les décisions des modules (Village, Donjon) doivent rester fondées sur un état
  exact, reconstruit à partir de leurs propres événements.

## Décision

- Les lectures transversales s'appuient sur des modèles de lecture : des tables
  placées dans le schéma PostgreSQL de leur module (`ranking`, `dungeon`). Les
  décisions s'appuient toujours sur le modèle d'écriture, c'est-à-dire le
  journal.
- Chaque modèle de lecture est tenu à jour par une projection. Son point de
  reprise, la position du dernier événement traité, est enregistré dans la table
  `platform.projections`.
- Une projection est rattrapée au moment où elle est consultée. Le rattrapage a
  lieu dans une seule transaction, avec le point de reprise verrouillé : les
  tables et le point de reprise avancent ensemble, et chaque événement n'est
  appliqué qu'une fois.
- Le rattrapage s'arrête devant une position manquante tant que l'événement qui
  la suit a moins de cinq secondes. Au-delà, la position est considérée comme
  une insertion annulée et elle est franchie.
- Chaque projection porte une version, enregistrée avec son point de reprise.
  Une version du code plus élevée que celle des tables provoque leur
  reconstruction à partir du journal ; une version moins élevée interdit toute
  écriture.
- Le classement est annoncé aux navigateurs par un canal global et discret, qui
  ne transmet que la position, le flux, la version et le type des événements.
  L'interface relit le classement jusqu'à ce que la projection ait atteint la
  position annoncée.

## Conséquences

### Positives

- Le coût d'une consultation ne dépend plus de l'historique du jeu : le
  classement est lu dans une table triée et limitée, la liste des expéditions
  ouvertes ne lit que les expéditions récentes grâce à un index.
- Les modules qui écrivent ne savent rien des projections qui les lisent : le
  Village et le Donjon n'ont pas été modifiés pour alimenter le Classement.
- Une nouvelle information peut être calculée pour le passé sans migration de
  données : le meilleur butin a été obtenu pour toutes les expéditions déjà
  jouées, en augmentant simplement la version de la projection.
- Aucune tâche de fond ni opération manuelle n'est nécessaire après un
  déploiement : la reconstruction a lieu d'elle-même, au premier rattrapage.
- Une projection défaillante peut être corrigée puis rejouée : les faits sont
  tous dans le journal, et aucune donnée n'est perdue.

### Négatives

- La cohérence n'est qu'à terme : un modèle de lecture peut avoir quelques
  secondes de retard sur le journal, en particulier lorsqu'il attend une
  position manquante. L'interface du classement doit donc relire jusqu'à
  obtenir la position attendue.
- La reconstruction a lieu pendant une consultation, dont la durée est limitée
  sur Vercel. Au-delà d'une certaine taille du journal, elle ne pourra plus
  aboutir dans ce délai.
- Après un retour à une version précédente de l'application, une projection dont
  la version avait été augmentée cesse d'avancer jusqu'au déploiement suivant :
  ses tables sont lues telles quelles, sans les nouveaux événements.
- Le Classement dépend du langage publié des autres modules. Un événement
  modifié ou ajouté sans réexamen de ses lecteurs passe inaperçu, sans aucune
  erreur, comme l'a montré la liste des expéditions ouvertes qui ignorait les
  compagnons.
- Le verrou du point de reprise sérialise les rattrapages simultanés d'une même
  projection : des consultations nombreuses s'attendent les unes les autres.

## Alternatives écartées

- **Mettre à jour les modèles de lecture dans la commande, par le module qui
  écrit** : rejeté, car le Village et le Donjon devraient connaître le Classement
  et ses tables, ce qui couple les modules et contredit l'ADR-0001.
- **Une tâche planifiée qui rattrape les projections** : rejetée, car les tâches
  planifiées de l'offre gratuite ne s'exécutent qu'une fois par jour ; le
  classement aurait jusqu'à un jour de retard.
- **Un processus de fond abonné au journal** : rejeté, car l'hébergement ne
  permet aucun processus permanent (ADR-0004).
- **Une vue matérialisée de PostgreSQL** : rejetée, car elle est entièrement
  recalculée à chaque rafraîchissement, ce qui reproduit le coût du rejeu, et
  il faudrait encore décider qui la rafraîchit et quand.
- **Conserver le calcul par rejeu** : rejeté, car le coût de chaque
  consultation continuerait de croître avec l'historique du jeu (DT-005).

## Réexamen

La décision devra être réexaminée si la reconstruction d'une projection
approche la durée maximale d'une fonction sur Vercel, ou si le nombre de
consultations simultanées rend le verrou du point de reprise trop limitant.

Elle devra aussi être revue si une lecture strictement à jour devient
nécessaire, ou si l'hébergement fournit un moyen fiable d'exécuter un
processus durable, qui permettrait de rattraper les projections en continu
plutôt qu'à la lecture.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des
consignes fournies et des ADR existantes. Le contenu a été relu pour vérifier
la couverture des contraintes de l'ADR-0002 (positions du journal), de l'ADR-0004
(aucun processus permanent) et des exigences relatives aux projections, au point
de reprise et à la reconstruction.
