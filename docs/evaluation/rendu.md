# Rendu de l'évaluation

- Auteur : Nathan Corberan
- Module : `clan`
- Adresse du déploiement : https://royaumes-swart.vercel.app
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/clan/` : `domain/`, `application/`, `infrastructure/`, `api.ts`, `index.ts`, `contracts.ts`, `ui.tsx` | `pnpm lint:archi` (règles de dépendance entre couches et entrées publiques) |
| E2 | `src/bootstrap/create-api.ts` (module, route `/clan`, canal, tâche quotidienne, gestionnaires, données personnelles) ; `app/(jeu)/clan/page.tsx` ; lien « Clan » de `src/ui/app-shell.tsx` | `src/bootstrap/clan-api.test.ts`, exécuté sur l'API assemblée par `create-api.ts` |
| E3 | `src/modules/clan/domain/clan.ts` (règles 1 à 7), `domain/chat.ts` (règle 8), `domain/treasury.ts` (règles 9 et 10) : fonctions pures, sans import technique | `domain/clan.test.ts`, `domain/chat.test.ts`, `domain/treasury.test.ts` |
| E4 | Tables classiques du schéma `clan` : `src/modules/clan/infrastructure/schema.ts`, migrations `drizzle/0013_clan.sql` et `drizzle/0014_clan_revision.sql` ; justification dans l'ADR 0010 | Fonction d'aptitude « range chaque table dans le schéma d'une brique de la plateforme ou d'un module » (`src/bootstrap/architecture.test.ts`) |
| E5 | `requireUser` sur `/clan/*` dans `create-api.ts` ; `api.ts` ne prend l'auteur que dans `c.var.userId` ; schémas Zod de `contracts.ts` | « refuse une requête anonyme (401) » ; « refuse un nom invalide (422), un nom ou un tag pris (409), et une entrée mal formée (400) » ; « refuse un montant invalide (422), une entrée mal formée (400)… » ; « n'agit sur aucun membre d'un autre clan (404) » ; revue de sécurité C1 à C3 et C6 |
| E6 | Messages `realm.withdraw` et `realm.deposit` de la boîte d'envoi, réponse sur `clan.transferResult` : `application/treasury-service.ts`, `messages.ts`, `infrastructure/drizzle-treasury-repository.ts` ; ADR 0011. Le Village n'est pas modifié | « prélève l'or du don dans le village, puis le crédite au trésor (201) » ; « annule le don si le village n'a pas assez d'or… » ; « le chef distribue de l'or du trésor à un membre, qui le reçoit dans son village (201) » ; « ne crédite un don qu'une seule fois, même si la réponse du Village est remise deux fois » |
| E7 | `src/modules/clan/personal-data.ts`, déclaré dans `create-api.ts` | « exporte l'appartenance, les demandes et les messages du joueur, sans ceux des autres » ; « efface le compte du chef : son rôle passe à son successeur… » ; « efface le compte du dernier membre : le clan est dissous » ; fonction d'aptitude « déclare les données personnelles de chaque module qui conserve des données » |
| E8 | Règles : un bloc `Règle N` par règle de la fiche dans les tests du domaine. Routes : chacune des 14 routes est appelée par `clan-api.test.ts` | Domaine : `Règle 1` à `Règle 10`. API : 39 tests dans `clan-api.test.ts` (gestion, chat, trésor, données personnelles) |
| E9 | Aucune modification de `.dependency-cruiser.cjs` ni des fonctions d'aptitude | `pnpm lint:archi` : 0 violation ; `src/bootstrap/architecture.test.ts` réussit |
| E10 | Déploiement Vercel, migrations `0013_clan` et `0014_clan_revision` appliquées par `pnpm vercel-build` | Parcours manuel sur la production : fondation d'un clan, demande et acceptation à deux joueurs, chat, don et distribution |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B1 | Canal temps réel `clan-<clan>` du chat, réservé aux membres du clan ; canal discret `clan-state-<clan>`, qui annonce chaque changement des membres, des rôles, des demandes et du trésor aux membres et aux joueurs qui ont demandé à rejoindre le clan | `src/modules/clan/index.ts` (règle des canaux et source), `src/modules/clan/ui.tsx` (`ClanWatcher`), `src/platform/realtime/channel-policy.ts`, `stream-api.ts` | « diffuse les messages sur le canal du clan, réservé à ses membres (403) » ; « ne diffuse sur le canal d'un clan que ses propres messages » ; « annonce chaque changement de l'état du clan sur son canal, sans en transmettre le contenu » ; « réserve le canal de l'état du clan à ses membres et aux joueurs qui ont demandé à le rejoindre (403) » ; « annonce la dissolution d'un clan à ses abonnés, une seule fois » ; « annonce les dons et les distributions sur le canal de l'état du clan » | README, section « Temps réel » ; `docs/architecture.md` ; ADR 0011 |
| B2 | Expiration paresseuse des demandes d'adhésion au bout de 7 jours, et tâche quotidienne `clan` (demandes et messages) | `domain/clan.ts` (`isExpired`, `REQUEST_TTL_MS`), `application/clan-service.ts`, `application/chat-service.ts`, `index.ts` (`dailyTask`) | `Règle 4` « une demande expire au bout de 7 jours » ; « fait expirer une demande sans réponse au bout de 7 jours » ; « supprime les messages au bout de 30 jours, à la lecture comme par la tâche quotidienne » | README, section « Données personnelles » ; ADR 0010 |
| B5 | Saga du don avec le Village, avec compensation : l'or prélevé pour un clan dissous entre-temps est reversé au donateur | `domain/treasury.ts` (`settleDonation`), `application/treasury-service.ts`, `messages.ts`, `infrastructure/drizzle-treasury-repository.ts` | `Règle 9` « l'or prélevé pour un clan dissous entre-temps est reversé au donateur » ; « reverse l'or au donateur si le clan a été dissous pendant le prélèvement » | ADR 0011 ; `docs/architecture.md`, diagramme de séquence « Parcours d'un don au trésor d'un clan » ; README, section « Échanges entre modules » |

## Écarts avec la fiche de cadrage

Les dix règles métier, les quatorze routes, le stockage, la communication avec le Village et
les données personnelles sont réalisés comme la fiche les annonce.

- Bonus non réalisés : B4 (projection « classement des clans ») et B6 (quêtes de clan
  alimentées par le Donjon), faute de temps. Les trois bonus réalisés sont prioritaires dans
  la fiche.
- Ajout par rapport à la fiche : en plus du chat, l'état du clan (membres, rôles, demandes,
  trésor) est synchronisé en temps réel entre les joueurs, par le canal `clan-state-<clan>`
  (ADR 0011). Il complète le bonus B1.
- Points que la fiche ne précisait pas, tranchés pendant la réalisation :
  - l'ancien chef devient officier lorsqu'il transmet son rôle ;
  - un don ou une distribution est limité à 1 000 000 d'or ;
  - lors de l'effacement du compte d'un chef, son rôle passe à l'officier le plus ancien, ou
    à défaut au membre le plus ancien ; s'il était le dernier membre, le clan est dissous ;
  - la plateforme a été complétée pour le Clan, sans modifier le Village : la fonction
    `enqueue` de la boîte d'envoi, et le nom du canal transmis à la source temps réel
    (ADR 0011).

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 232 | 308 |
| Couverture des lignes | 75 % | 74,8 % |
| Violations des règles d'architecture | 0 | 0 |

## Usage de l'IA générative

Un assistant IA (Claude, d'Anthropic) a été utilisé pour l'ensemble du travail, à partir des
consignes du TD, de la fiche de cadrage et du code existant du projet.

- Code : l'assistant a rédigé le domaine, la couche application, les adaptateurs, l'API,
  l'interface du module et les modifications de la plateforme et de la racine de
  composition. Le choix du module, de ses règles et de ses bonus a été fait par l'étudiant.
- Tests : l'assistant a rédigé les tests du domaine et de l'API. Les tests de concurrence ont
  été vérifiés en les faisant échouer sur le code sans correction.
- Documents : l'assistant a structuré et rédigé la fiche de cadrage, les ADR 0010 et 0011,
  la documentation d'architecture, le README, le registre de la dette, la revue de sécurité,
  le registre des traitements, le bilan technique et ce document.

Les résultats ont été vérifiés par `pnpm lint`, `pnpm typecheck`, `pnpm lint:archi`,
`pnpm test:coverage` et `pnpm build`, par le rendu des diagrammes Mermaid, et par un
parcours manuel du module sur le déploiement de production. Le contenu a été relu pour
vérifier la correspondance entre la fiche de cadrage, le code, les tests et les documents.
