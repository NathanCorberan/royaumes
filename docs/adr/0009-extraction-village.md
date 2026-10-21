# ADR-0009 - Le Village peut être extrait dans un service autonome, préparé mais non déployé

- Statut : accepté
- Date : 2026-10-21

## Contexte

- L'ADR-0001 a retenu un monolithe modulaire, en promettant des frontières entre modules
  assez strictes pour qu'un module puisse être extrait le jour où le besoin apparaîtrait.
  Cette promesse n'avait jamais été vérifiée.
- Les raisons d'extraire un module sont connues : une charge propre à ce module, qui
  demande de le dimensionner à part ; une équipe distincte qui le fait évoluer ; un
  rythme de déploiement différent du reste ; une exigence d'isolation des pannes ou des
  données. Aucune ne s'applique aujourd'hui au jeu : une seule personne le développe,
  tous les modules sont déployés ensemble, et le test de charge ne désigne aucun module
  qui serait seul en difficulté.
- Le Village est le meilleur candidat : son domaine ne dépend d'aucun autre module, il ne
  lit les données d'aucun autre module, et sa relation avec le Marché passe déjà par les
  messages de la saga (ADR-0007).
- L'inventaire de ses dépendances compte deux liens qui ne passent pas par le code : le
  Classement et le canal temps réel du village lisent ses événements directement dans le
  journal commun. Aucune règle de dependency-cruiser ne les signale.

## Décision

- Le Village peut s'exécuter dans un service autonome, doté de sa propre base, de son
  propre journal et de sa propre boîte d'envoi. Le domaine, le service et l'API du module
  ne sont pas modifiés : le service les assemble avec sa propre instance de la plateforme.
- L'application devient alors une passerelle : elle reçoit une version distante du module
  Village, de même forme que la version exécutée dans le processus (API, règle du canal,
  gestionnaires de messages, données personnelles). Le reste de l'application ne voit pas
  la différence.
- Les messages de la saga franchissent la frontière par une boîte de réception. Un message
  n'est marqué comme traité qu'à la réception d'une réponse de succès : les garanties de la
  boîte d'envoi (livraison au moins une fois, nouvel essai, gestionnaires idempotents) ne
  sont pas modifiées.
- Un relais recopie le flux d'événements publié par le service dans le journal de
  l'application, où le Classement et le canal temps réel continuent de le lire sans
  modification. Le relais est déclenché après chaque commande du Village et chaque message
  de la saga, et une fois par jour par la tâche quotidienne. Il est idempotent.
- Les échanges entre les deux processus sont authentifiés par un secret partagé, transmis
  dans l'en-tête `Authorization`. Ce secret n'est jamais versionné : il n'est défini que
  dans le terminal qui lance chaque processus.
- Le service n'est pas déployé. Il n'est utilisé que si `REALM_SERVICE_URL` et
  `SERVICE_SECRET` sont définies ; en production, sur Vercel, le Village s'exécute dans
  l'application, comme depuis le TD2.

## Conséquences

### Positives

- Les frontières du Village sont démontrées, et non plus supposées : le module s'exécute
  dans un autre processus sans que son domaine ni son API changent.
- Six tests de contrat vérifient à chaque construction l'accord entre l'application et le
  service : transmission des requêtes, refus sans le secret, Classement alimenté par le
  relais, échange du Marché, reprise après une panne du service, export et effacement.
- L'extraction est réversible sans migration de données : le relais dépose une copie
  complète des événements dans le journal de l'application, qui peut de nouveau exécuter
  le Village seule.
- La boîte de réception et l'authentification entre services appartiennent à la
  plateforme, et serviraient telles quelles à l'extraction d'un autre module.
- Le coût réel d'une extraction est mesuré : un second processus, une seconde base, un
  relais, un secret, et une panne partielle possible.

### Négatives

- Deux chemins d'exécution du Village sont à maintenir : l'un dans le processus, l'autre
  distant. Une évolution de l'API du Village doit être vérifiée dans les deux.
- Les événements du Village sont copiés dans le journal de l'application. Cette copie n'est
  plus la source de vérité, et sa cohérence est différée : un événement n'y apparaît qu'une
  fois relayé.
- Le service comporte des raccourcis à traiter avant tout déploiement : il applique toutes
  les migrations de l'application, son flux publié n'est pas paginé, et sa boîte d'envoi
  n'est distribuée qu'à la réception d'un message. Ils sont consignés au registre de la
  dette technique.
- L'authentification par secret partagé est la plus simple possible : le même secret
  authentifie les deux sens, et sa fuite permettrait de se faire passer pour n'importe quel
  joueur auprès du service.

## Alternatives écartées

- **Déployer le service** : rejeté, car aucune des raisons d'extraire ne s'applique au
  jeu. Un second déploiement ajouterait une base, des secrets et des journaux à surveiller,
  sans bénéfice en contrepartie.
- **Ne pas extraire** : rejeté, car les frontières de l'ADR-0001 seraient restées une
  hypothèse, et les dépendances qui ne passent pas par le code n'auraient pas été révélées.
- **La lecture à distance du flux publié par le Classement et le canal temps réel** :
  rejetée, car elle obligeait le moteur des projections et le Classement à lire deux
  sources. Le relais laisse ces consommateurs inchangés, conformément au motif de
  l'étrangleur.
- **Extraire le Marché** : rejeté, car sa saga lie son sort à celui du Village, dont il
  importe les contrats. Le Village, qui ne dépend d'aucun autre module, est le candidat le
  plus simple.
- **Un jeton signé (JWT) ou le TLS mutuel pour authentifier les échanges** : écartés pour
  le moment, car ils demandent une gestion de clés ou de certificats disproportionnée pour
  un service exécuté sur le poste de développement. Ils devront remplacer le secret
  partagé avant tout déploiement.

## Réexamen

La décision devra être réexaminée, pour déployer le service, si l'un des signes suivants
apparaît :

- le test de charge montre que le Village dépasse le budget de performance alors que les
  autres modules le respectent ;
- une seconde équipe est chargée du Village, et doit le faire évoluer indépendamment du
  reste du jeu ;
- le Village doit être déployé plus souvent que le reste du jeu, ou isolé de ses pannes.

Elle devra aussi être revue si le maintien des deux chemins d'exécution coûte plus que la
démonstration qu'il apporte.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des
consignes fournies et des ADR existantes. Le contenu a été relu pour vérifier
la couverture des exigences relatives à l'extraction du Village, à la passerelle,
au relais du flux publié et à l'authentification entre services.
