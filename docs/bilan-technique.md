# Bilan technique de Royaumes

- Date : 2026-10-21
- Version examinée : étiquette `td11-fin`
- Auteur : Nathan Corberan

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 6 : `realm`, `dungeon`, `market`, `ranking`, `tavern`, `system` |
| Briques de la plateforme | 9 : `auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime` ; plus le service Village extrait (`src/services/village`, 81 lignes) |
| Lignes de code, hors tests | Environ 8 210 (`src` et `app`) |
| Fichiers de test, nombre de tests | 33 fichiers, 232 tests |
| Commits | 80 à l'étiquette `td11-fin` |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | 1 084 |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | 2 059 |
| `market` | Event Sourcing, projection des offres, saga | 1 267 |
| `ranking` | Projection du journal | 459 |
| `tavern` | Tables ordinaires | 677 |
| `system` | Aucun | 73 |

Le Village est passé d'environ 940 à 1 084 lignes avec l'extraction : la différence
correspond au module distant (`remote.ts`).

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) | A tenu : le Village s'exécute dans un autre processus sans que son domaine ni son API changent. Prix : un module distant, un relais et six tests de contrat |
| 0002 | Event Sourcing pour le Village | Projections du Classement (TD8), effacement des données personnelles (TD10), extraction (TD11) | A tenu : le journal a alimenté le Classement, puis a été recopié par le relais sans perte. Prix : une exception à l'ajout seul, encadrée par l'ADR 0008 |
| 0003 | Server-Sent Events alimentés par le journal | Canaux du Donjon et du Marché sans données d'événement, canal de la Taverne alimenté par une table (TD10) | A tenu : une source propre au module a suffi pour la Taverne. Prix : chaque flux interroge la base à intervalle régulier, une charge qui croît avec les joueurs connectés |
| 0004 | Manches simultanées et échéances paresseuses | Revue de sécurité du Donjon (D2, D8, D9) ; compagnon contrôlé par l'IA | A tenu : les échéances sont appréciées par l'horloge du serveur, sans tâche de fond |
| 0005 | Intelligence artificielle déterministe | Revue de sécurité du Donjon (D11, D12) ; simulations par `scripts/simulate-dungeon.ts` | A tenu : le compagnon et les monstres ne révèlent rien aux joueurs, et leurs décisions sont reproductibles |
| 0006 | CQRS et projections rattrapées à la lecture | Mesure de charge (TD11, partie 3) | A tenu après correction consignée : le rattrapage ouvrait une transaction verrouillée même sans rien à appliquer. Le chemin rapide a augmenté le débit des lectures concernées de 30 à 42 % |
| 0007 | Saga orchestrée et boîte d'envoi | Acceptations simultanées (M4), panne partielle du service Village (TD11, partie 4) | A tenu : la saga reprend après la panne du service sans aucune ligne de code supplémentaire. Prix : un outil d'exploitation pour les messages abandonnés (DT-007) |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Revue de conformité au RGPD (R4, R5) ; copies relayées par l'extraction | A tenu : l'effacement atteint aussi les copies relayées. Prix : deux non-conformités hors de son périmètre, les sessions expirées et les journaux techniques |
| 0009 | Extraction du Village, préparée mais non déployée | Tests de contrat et démonstration à deux processus (TD11, partie 4) | Décision récente, éprouvée en local seulement : rien ne l'a encore confrontée à un déploiement |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 232 tests réussis ; domaines couverts à 99,7 % des lignes | Satisfaisante : toutes les règles du jeu sont vérifiées sans base ni réseau |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | De 263 (Marché) à 458 (Village) requêtes par seconde ; p99 de 60 à 104 ms, sans erreur (`perf/apres.json`) | Satisfaisante : budget respecté (p99 inférieur à 500 ms sous 20 connexions). Mesure locale, qui ne prédit pas la production mais permet de comparer |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Tests de distributions et d'acceptations simultanées, de messages remis deux fois, de reprise après panne du service ; aucun message abandonné sur la base de développement | Satisfaisante : les messages abandonnés peuvent désormais être examinés et relancés (`scripts/dead-letters.ts`) |
| Sécurité | Exigences des revues de sécurité | 40 exigences : 34 conformes, 5 non conformes, 1 risque accepté | À améliorer : les cinq non-conformités de la revue de l'authentification n'ont pas été traitées |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 8 règles de dependency-cruiser sans violation ; 2 fonctions d'aptitude vérifiées par des tests ; 75 % des lignes couvertes | Satisfaisante pour le serveur (modules à 93,6 %, plateforme à 88,1 %). L'interface (`ui.tsx`, `src/ui/`) est couverte à 0 % : elle n'est vérifiée qu'à la main, et une régression du temps réel ne serait détectée par aucun test |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Village extrait dans un service autonome, réversible sans migration ; PGlite en local et en test, Neon en production, sans changement de code | Satisfaisante : la promesse de l'ADR 0001 est démontrée |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 12 |
| Entrées remboursées, dont à l'échéance prévue | 7, toutes à l'échéance prévue |
| Entrées ouvertes | 5 |

Analyse : les sept premières entrées (DT-001 à DT-007) ont toutes été remboursées au TD
prévu, ce qui montre que la dette a été pilotée et non subie. Les cinq entrées ouvertes
se répartissent en deux groupes. DT-010 à DT-012 concernent le service Village extrait,
qui n'est pas en production : leur échéance est la remise en cause de l'ADR 0009. DT-008
(sessions expirées) et DT-009 (erreurs écrites en entier dans les journaux) viennent de la
revue de conformité au RGPD, avec une échéance au TD11 qui n'a pas été tenue : ce sont les
deux premières dettes à rembourser. Enfin, les cinq actions de la revue de l'authentification
n'ont jamais été inscrites au registre : c'est une dette non consignée, qui risque d'être
oubliée.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 16 | 11 | 5 non conformes (S3, S5, S7, S9, S14) | 5 actions à décider, absentes du registre de la dette |
| Sécurité du Donjon | 14 | 13 | 1 risque accepté (D10) | Aucune |
| Sécurité du Marché | 10 | 10 | Aucune | Aucune (DT-007 remboursée) |
| Conformité au RGPD | 10 | 7 | 2 non conformes (R8, R9), 1 risque accepté (R10) | DT-008, DT-009 |

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Charge des flux temps réel, qui croît avec le nombre de joueurs connectés (ADR 0003) | Hausse de la durée d'exécution des fonctions Vercel et du nombre de requêtes de lecture du journal, à nombre de commandes constant | Ajouter au test de charge un scénario de flux ouverts, et fixer un budget ; envisager un service de diffusion dédié si le budget est dépassé |
| 2 | Croissance du journal, qui allonge la reconstruction des projections et l'effacement d'un compte (ADR 0006 et 0008) | Durée d'une reconstruction ou d'un effacement qui approche la durée maximale d'une requête | Mesurer ces deux opérations à chaque TD de fond ; indexer la lecture du journal par flux, et préférer les références sans copie pour tout nouvel événement |
| 3 | Interface sans test automatique | Régressions découvertes à la main, par exemple un écran qui ne se met plus à jour en temps réel | Ajouter des tests de bout en bout (Playwright) sur les parcours principaux : connexion, Village, échange au Marché, Taverne |

## 7. Conclusion

Le projet peut être repris et évoluer sans régression pour tout ce qui concerne le serveur :
ses frontières sont vérifiées à chaque construction, ses règles métier sont presque
entièrement couvertes, ses décisions sont consignées et ont résisté à leur mise à l'épreuve,
jusqu'à l'extraction d'un module. Trois conditions restent à remplir : rembourser DT-008 et
DT-009 et inscrire au registre les actions de la revue de l'authentification, couvrir
l'interface par des tests automatiques, et surveiller la charge du temps réel et la
croissance du journal à mesure que le nombre de joueurs augmente.

## Usage de l'IA générative

Un assistant IA a été utilisé pour structurer et rédiger ce bilan à partir des
consignes fournies, des ADR, des revues et du registre de la dette. Les valeurs ont été
relevées par les commandes de la partie 2, la mesure de couverture et le test de charge,
et le contenu a été relu pour vérifier la couverture des exigences relatives au bilan
technique du projet.
