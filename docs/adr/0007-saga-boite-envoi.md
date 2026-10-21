# ADR-0007 - Les opérations qui concernent plusieurs modules sont des sagas orchestrées, dont les messages passent par une boîte d'envoi transactionnelle

- Statut : accepté
- Date : 2026-10-21

## Contexte

- Un échange du Marché modifie les données de trois flux : celui de l'offre, qui
  appartient au Marché, et ceux des villages du vendeur et de l'acheteur, qui
  appartiennent au Village. À la fin d'un échange, aucune ressource ne doit avoir été
  créée ni perdue.
- Seul le Village décide de ce qui arrive à un village (TD2) : le Marché ne peut pas
  écrire dans ses flux, ni vérifier lui-même un stock.
- Un module doit pouvoir être extrait un jour dans un service doté de sa propre base de
  données (TD11). Une transaction qui englobe les données de deux modules rendrait cette
  extraction impossible sans réécrire l'opération.
- L'hébergement ne permet aucun processus permanent ni tâche de fond fiable (ADR-0004).
- Une fonction Vercel peut être interrompue à tout moment, par exemple lorsqu'elle
  dépasse sa durée maximale : enregistrer un événement puis appeler un autre module
  peut laisser l'une des deux écritures sans l'autre.

## Décision

- Une transaction ne modifie jamais les données que d'un seul module.
- Une opération qui concerne plusieurs modules est une saga : une suite de
  transactions locales. Ses étapes sont identifiées comme compensables (la mise en
  séquestre des ressources du vendeur), pivot (le paiement de l'acheteur) ou reprises
  jusqu'au succès (les versements et la restitution).
- La saga est orchestrée par le module qui porte l'opération, ici le Marché. Les
  participants ne connaissent pas la saga : le Village sait seulement prélever et
  verser des ressources, et répond au sujet indiqué dans chaque demande (adresse de
  retour).
- Les messages sont enregistrés dans la boîte d'envoi de la plateforme
  (`platform.outbox`), dans la même transaction que les événements qui les déclenchent.
- La distribution est garantie au moins une fois : un bail de trente secondes pendant
  le traitement, un nouvel essai avec un délai croissant après un échec, et l'abandon
  d'un message après dix tentatives.
- Chaque gestionnaire est idempotent, grâce à une clé d'idempotence choisie par le
  demandeur : l'identifiant du mouvement, construit à partir de l'offre et de l'étape
  de la saga.
- La distribution a lieu après chaque commande et chaque consultation du Marché, et
  une fois par jour par une tâche planifiée de Vercel, protégée par le secret
  `CRON_SECRET`.

## Conséquences

### Positives

- Aucun module n'écrit dans les données d'un autre : le Marché ne connaît que le
  langage publié du Village, et le Village ne connaît rien du Marché.
- Une panne à n'importe quel moment ne perd ni ne duplique aucune ressource : un
  message enregistré finit par être remis, et un doublon n'a aucun effet.
- Le Village peut servir d'autres demandeurs sans être modifié, par exemple pour un
  impôt ou une récompense.
- La boîte d'envoi sert aussi de minuterie : l'expiration d'une offre est un simple
  message différé, sans mécanisme supplémentaire.
- Le déroulement complet de la saga se lit en un seul endroit, dans la fonction
  `requestsFor` du Marché.

### Négatives

- Les joueurs voient des états intermédiaires, comme une offre en réservation ou en
  règlement, que l'interface doit présenter correctement.
- La latence dépend de l'activité des joueurs : une saga interrompue ne reprend qu'à
  la consultation suivante du Marché, ou au plus tard le lendemain, lors de la tâche
  planifiée.
- Chaque gestionnaire doit être écrit pour être idempotent, et ses doublons doivent
  être testés.
- Un message abandonné après dix tentatives reste dans la table, mais aucun outil ne
  permet encore de l'examiner ni de le relancer (dette DT-007).
- La table de la boîte d'envoi grandit sans limite, puisque les messages traités sont
  conservés.

## Alternatives écartées

- **Une transaction unique sur les données des deux modules** : rejetée, car le Marché
  devrait connaître les événements et les règles du Village, ce qui casse
  l'encapsulation, et l'extraction d'un module deviendrait impossible.
- **Une transaction distribuée par validation en deux phases** : rejetée, car elle est
  peu disponible dans les services hébergés, rend chaque base dépendante des autres et
  garde des verrous pendant toute la coordination.
- **Un appel direct du Village par le Marché, sans boîte d'envoi** : rejeté, car une
  panne entre l'enregistrement de l'offre et l'appel laisse le système incohérent
  (double écriture).
- **Une saga chorégraphiée** : rejetée, car le Village devrait réagir aux événements du
  Marché et donc les connaître, et le déroulement de l'échange serait réparti entre les
  modules.
- **Le journal d'événements utilisé comme boîte d'envoi** : rejeté, car un message est
  une commande adressée à un destinataire et non un fait, et la distribution doit
  suivre, message par message, le nombre de tentatives et la dernière erreur.

## Réexamen

La décision devra être réexaminée si un module est extrait dans un service distinct :
il faudrait alors une boîte d'envoi par base de données, et un transport des messages
entre les services.

Elle devra aussi être revue si le volume de messages justifie un courtier de messages
dédié, ou si la distribution déclenchée par les requêtes des joueurs ne suffit plus à
tenir la latence attendue.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des
consignes fournies et des ADR existantes. Le contenu a été relu pour vérifier
la couverture des exigences relatives à la saga, à la boîte d'envoi et à
l'idempotence.
