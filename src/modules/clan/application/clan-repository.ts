import type { ClanSummary } from '../contracts'
import type { Clan, JoinRequest, Member } from '../domain/clan'

/**
 * Port de persistance des clans, défini par la couche application.
 * Il n'est pas fondé sur des événements : il lit et modifie l'état courant des clans.
 */
export interface ClanRepository {
  /** Clan d'un joueur, avec ses membres ; null si le joueur n'a pas de clan. */
  clanOf(playerId: string): Promise<Clan | null>
  /** Clan désigné par son identifiant, avec ses membres ; null s'il n'existe pas. */
  byId(clanId: string): Promise<Clan | null>
  /** Tous les clans, par ordre alphabétique. */
  list(): Promise<ClanSummary[]>
  /** Vrai si un clan porte déjà ce nom, ou ce tag. */
  isTaken(field: 'name' | 'tag', value: string): Promise<boolean>
  /**
   * Fonde un clan et y inscrit son chef, en une seule transaction. Renvoie faux si le nom,
   * le tag ou le joueur ont été pris entre-temps, par une requête simultanée.
   */
  found(
    clan: { id: string; name: string; tag: string; foundedAt: number },
    leader: Member,
  ): Promise<boolean>
  /**
   * Inscrit un membre, sans jamais dépasser max membres, même lors d'acceptations simultanées.
   * Renvoie 'in-clan' si le joueur a rejoint un autre clan entre-temps, 'full' si le clan est complet.
   */
  addMember(clanId: string, member: Member, max: number): Promise<'added' | 'in-clan' | 'full'>
  /** Modifie le rôle d'un ou de plusieurs membres, en une seule transaction. */
  setRoles(members: Member[]): Promise<void>
  /** Retire un membre de son clan. */
  removeMember(playerId: string): Promise<void>
  /** Dissout un clan : ses membres, ses demandes et ses messages sont supprimés avec lui. */
  dissolve(clanId: string): Promise<void>

  /** Enregistre une demande d'adhésion. */
  addRequest(request: JoinRequest): Promise<void>
  /** Demande désignée par son identifiant ; null si elle n'existe pas. */
  request(requestId: string): Promise<JoinRequest | null>
  /** Demandes d'un joueur. */
  requestsOf(playerId: string): Promise<JoinRequest[]>
  /** Demandes adressées à un clan, de la plus ancienne à la plus récente. */
  requestsFor(clanId: string): Promise<JoinRequest[]>
  /** Supprime une demande. */
  removeRequest(requestId: string): Promise<void>
  /** Supprime toutes les demandes d'un joueur, par exemple lorsqu'il rejoint un clan. */
  removeRequestsOf(playerId: string): Promise<void>
  /** Supprime les demandes envoyées au plus tard à l'instant at ; renvoie leur nombre. */
  removeRequestsUntil(at: number): Promise<number>
}
