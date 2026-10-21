# ADR-0008 - La Taverne utilise un stockage classique, et l'effacement d'un joueur réécrit les seuls champs personnels du journal

- Statut : accepté
- Date : 2026-10-21

## Contexte

- La Taverne conserve des messages et la présence des joueurs. Ce sont des données
  personnelles destinées à disparaître : un message est supprimé trente jours après sa
  publication, et la présence n'est conservée que le temps de la visite.
- Le RGPD donne au joueur un droit d'accès et à la portabilité (articles 15 et 20) et un
  droit à l'effacement (article 17). Ces droits portent sur le jeu entier, et non sur la
  seule Taverne.
- Des données personnelles ont déjà été copiées dans le journal : le nom du joueur dans
  les événements du Donjon (`GameCreated`, `PlayerJoined`) et du Marché
  (`OfferPublished`, `OfferAccepted`), et le nom de son village dans `VillageFounded`.
  Ces événements appartiennent parfois à des flux partagés avec d'autres joueurs, comme
  une expédition ou une offre.
- Le journal est en ajout seul : aucun événement n'est jamais modifié ni supprimé
  (ADR-0002). Les projections du Classement, des expéditions ouvertes et du Marché en
  dépendent, et doivent pouvoir être reconstruites à tout moment (ADR-0006).
- L'hébergement ne maintient aucune connexion permanente avec les navigateurs, et ne
  permet aucune tâche de fond fiable.

## Décision

- La Taverne n'utilise pas l'Event Sourcing : ses messages et sa présence sont rangés
  dans des tables ordinaires du schéma `tavern`, dont les lignes sont supprimées à
  l'expiration de leur durée de conservation.
- Son canal temps réel est alimenté par une source fournie par le module, qui lit la
  table des messages, et non par le journal.
- La présence repose sur un signal envoyé par le navigateur toutes les trente secondes.
  La table ne contient qu'une ligne par joueur présent, supprimée à son départ ou deux
  minutes après son dernier signal. Aucun historique des visites n'est conservé.
- Les durées de conservation sont appliquées à chaque lecture, et une fois par jour par
  la route des tâches quotidiennes (`/api/cron/daily`), même si personne ne visite la
  Taverne.
- Chaque module, ainsi que l'identité, déclare ses données personnelles par un
  contributeur : il les exporte, réécrit ses événements et efface ses tables.
- L'effacement réécrit les seuls champs de nom des événements du joueur, remplacés par
  « Joueur effacé » ou « Village effacé ». La réécriture passe par une fonction unique de
  la plateforme, et elle est consignée dans un registre des effacements qui ne contient
  aucune donnée sur le joueur.
- L'identité est effacée en dernier, et chaque étape est idempotente : un effacement
  interrompu peut être relancé par le joueur lui-même.

## Conséquences

### Positives

- Le joueur exerce lui-même ses droits, depuis la page « Mes données », sans
  intervention d'un administrateur.
- L'effacement n'altère ni les états reconstruits, aux noms près, ni l'historique des
  autres joueurs : leurs expéditions et leurs échanges restent intacts.
- La durée de conservation est garantie même lorsque la Taverne reste sans activité.
- La Taverne est plus simple que si elle avait suivi le modèle des autres modules : ni
  événements, ni versions, ni concurrence optimiste.
- La correction directe des tables de lecture donne le même résultat qu'une
  reconstruction à partir du journal réécrit.

### Négatives

- L'ajout seul du journal admet désormais une exception. Toute modification future du
  journal devra en respecter strictement les limites : les seuls champs personnels, par
  la seule fonction de la plateforme, avec une trace dans le registre.
- Le coût de l'effacement et de l'export croît avec la taille du journal, puisqu'ils le
  parcourent en entier.
- Chaque événement futur crée une obligation nouvelle : déclarer ses champs personnels
  dans le contributeur de son module, faute de quoi ils échapperont à l'effacement.
- L'identifiant du joueur reste dans le journal. Sa pseudonymisation n'est réelle que si
  tout lien entre cet identifiant et la personne est effectivement détruit.
- La présence n'est pas diffusée en temps réel : une arrivée ou un départ n'apparaît
  chez les autres joueurs qu'à leur signal suivant.

## Alternatives écartées

- **L'Event Sourcing pour la Taverne** : rejeté, car l'historique des messages n'a
  aucune valeur, aucun autre module ne lit ces événements, et des messages destinés à
  disparaître iraient contre le principe même d'un journal en ajout seul.
- **La suppression des flux du joueur** : rejetée, car elle est impossible pour les flux
  partagés, et détruirait l'historique des autres joueurs.
- **L'effacement cryptographique** : rejeté, car il imposerait un chiffrement et un
  déchiffrement dans chaque module et chaque projection, et ne s'appliquerait pas aux
  événements déjà enregistrés en clair.
- **Les références sans copie** : écartées pour l'existant, car elles ne règlent pas le
  cas des événements déjà enregistrés avec les noms en clair.
- **Un service externe de présence, comme une base clé-valeur en mémoire** : rejeté,
  car il ajouterait un service à héberger et à sécuriser pour un besoin que la base
  existante couvre.

## Réexamen

La décision devra être réexaminée lors de la conception d'un nouveau module : les
références sans copie, qui n'enregistrent que l'identifiant du joueur, devront alors
être préférées dès l'origine.

Elle devra aussi être revue si la taille du journal rend l'effacement trop long pour
une requête, ou si la doctrine sur l'anonymisation des identifiants pseudonymes évolue.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger cet ADR à partir des
consignes fournies et des ADR existantes. Le contenu a été relu pour vérifier
la couverture des exigences relatives à la Taverne, à la conservation, à l'export
et à l'effacement des données personnelles.
