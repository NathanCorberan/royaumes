# ADR-0011 - Le trésor du Clan communique avec le Village par une saga, dont les messages passent par la boîte d'envoi

- Statut : accepté
- Date : 2026-10-23

## Contexte

- Un membre donne de l'or au trésor de son clan : cet or doit être prélevé dans son village,
  puis crédité au trésor. Le chef distribue de l'or du trésor à un membre : cet or doit être
  versé dans le village du membre. Aucun or ne doit être créé ni perdu.
- Seul le Village décide de ce qui arrive à un village (TD2). Son langage publié offre déjà
  deux sujets : `realm.withdraw`, qui peut être refusé, et `realm.deposit`, qui ne peut pas
  l'être, avec une adresse de retour et un identifiant de mouvement (ADR-0007).
- Le clan d'un donateur peut être dissous pendant le prélèvement : son dernier membre peut le
  quitter, ou effacer son compte.
- Le Clan n'utilise pas le journal d'événements (ADR-0010). Seul le journal savait enregistrer
  des messages dans la boîte d'envoi, et la règle 6 du TD11 interdit à un module d'importer la
  table `platform.outbox`.
- Le chat du clan doit être reçu en temps réel par les seuls membres du clan. La source d'un
  canal qui ne lit pas le journal, introduite pour la Taverne, ne recevait que la position de
  reprise, et non le nom du canal.

## Décision

- Le Clan communique avec le Village par des messages de la boîte d'envoi, et non par la
  lecture de son langage publié : il doit modifier un village, et non seulement le lire.
- Un don est une saga orchestrée par le Clan :
  1. le don est enregistré en attente, avec un message `realm.withdraw` dont l'identifiant de
     mouvement est celui du don et l'adresse de retour `clan.transferResult`, dans une même
     transaction ;
  2. si le Village répond que l'or est prélevé, le don est crédité au trésor ;
  3. s'il répond que l'or manque, le don est annulé, et rien n'est crédité ;
  4. si l'or est prélevé mais que le clan a été dissous entre-temps, l'étape est compensée :
     un message `realm.deposit` reverse l'or au donateur.
- Une distribution débite le trésor et enregistre un message `realm.deposit` dans une même
  transaction ; le versement ne peut pas être refusé, et n'attend aucune réponse.
- Le gestionnaire de `clan.transferResult` est idempotent : le don n'est réglé que s'il est
  encore en attente, par une seule instruction conditionnée par son état.
- La plateforme expose une fonction `enqueue`, qui enregistre des messages dans la boîte
  d'envoi avec la transaction fournie par un module. Le Clan l'appelle dans ses propres
  transactions, sans jamais importer la table de la plateforme.
- La source d'un canal reçoit désormais le nom du canal. Le Clan déclare un canal par clan,
  `clan-<identifiant>`, alimenté par la table de ses messages filtrée sur ce clan, et réservé
  à ses membres.
- Un second canal par clan, `clan-state-<identifiant>`, annonce chaque changement de l'état du
  clan : ses membres et leurs rôles, ses demandes, son trésor. Il ne transmet aucune donnée :
  sa position est la révision du clan (ADR-0010), et chaque abonné relit l'état du clan auprès
  de l'API, comme avec un canal discret. Il est ouvert aux membres du clan et aux joueurs qui
  ont demandé à le rejoindre, qui voient ainsi aussitôt l'acceptation ou le refus. La
  dissolution est annoncée par un dernier événement, à la plus grande position possible.
- Le Village n'est pas modifié : le Clan utilise les sujets existants de son langage publié.

## Conséquences

### Positives

- La livraison est garantie au moins une fois : un don enregistré finit par être réglé, même
  si la fonction est interrompue juste après la commande.
- Un doublon n'a aucun effet : le Village ignore un mouvement déjà traité, et le Clan un don
  déjà réglé. Le test « ne crédite un don qu'une seule fois » le vérifie.
- La compensation garantit qu'un don à un clan dissous ne fait pas disparaître l'or du
  donateur.
- Le Village sert un deuxième demandeur sans aucune modification, ce que l'ADR-0007
  annonçait.
- La fonction `enqueue` et le nom du canal transmis à la source sont des ajouts génériques :
  un futur module à tables classiques pourra s'en servir, et la Taverne fonctionne sans
  changement.

### Négatives

- La cohérence est différée : tant que la boîte d'envoi n'est pas distribuée, un don reste en
  attente, et le joueur peut voir l'or quitter son village avant d'arriver au trésor.
- La distribution est déclenchée après chaque don et chaque distribution ; une saga
  interrompue ne reprend qu'au don suivant, à la consultation du Marché ou à la tâche
  quotidienne.
- Trois fichiers de la plateforme ont été modifiés pour un module (`outbox.ts`,
  `channel-policy.ts` et `stream-api.ts`) : chaque ajout de ce genre élargit le contrat de la
  plateforme, qu'il faudra maintenir.
- Le canal d'un clan vérifie l'appartenance à l'ouverture du flux : un membre exclu continue
  de recevoir les messages jusqu'à la fermeture de ce flux, au plus quatre minutes.

## Alternatives écartées

- **La lecture du langage publié du Village** : rejetée, car le Clan doit modifier un
  village, et une lecture ne prélève ni ne verse rien.
- **Un appel direct du service du Village** : rejeté, car il casse l'encapsulation, et une
  panne entre le prélèvement et le crédit laisserait l'or perdu (double écriture).
- **Le trésor rangé dans le Village**, comme une ressource partagée : rejeté, car le Village
  ne connaît pas les clans, et devrait apprendre leurs règles.
- **L'insertion directe dans `platform.outbox` par le Clan** : rejetée, car elle enfreint la
  règle 6 du TD11, et la fonction d'aptitude échouerait.
- **Un canal global discret pour tous les clans** : rejeté, car chaque membre recevrait un
  signal pour les messages de tous les clans, et la séparation des clans ne reposerait que sur
  la relecture de l'API.

## Réexamen

La décision devra être réexaminée si le Village est extrait en service autonome (ADR-0009) :
les messages du Clan passeraient alors par le relais entre les services, ce qui devra être
vérifié par un test de contrat.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des
consignes fournies et des ADR existantes. Le contenu a été relu pour vérifier
la couverture des exigences relatives à la saga du trésor, à la boîte d'envoi,
à l'idempotence, à la cohérence différée et au canal temps réel du chat.
