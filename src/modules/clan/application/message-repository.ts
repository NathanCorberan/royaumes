import type { ClanMessage } from '../contracts'

/** Message à enregistrer : son identifiant est attribué par le stockage. */
export type NewClanMessage = Omit<ClanMessage, 'id'>

/**
 * Port de persistance des messages du chat des clans, défini par la couche application.
 * Comme ceux de la Taverne, les messages sont insérés, lus, puis supprimés.
 */
export interface MessageRepository {
  /** Enregistre un message et le renvoie, avec son identifiant. */
  add(message: NewClanMessage): Promise<ClanMessage>
  /** Derniers messages d'un clan, du plus ancien au plus récent. */
  latest(clanId: string, limit: number): Promise<ClanMessage[]>
  /** Messages d'un clan postérieurs à un identifiant, du plus ancien au plus récent. */
  after(clanId: string, id: number, limit: number): Promise<ClanMessage[]>
  /** Identifiant du dernier message, tous clans confondus ; 0 s'il n'y en a aucun. */
  lastId(): Promise<number>
  /** Dates des messages d'un auteur publiés depuis l'instant since. */
  postedSince(authorId: string, since: number): Promise<number[]>
  /** Supprime les messages publiés avant l'instant before ; renvoie leur nombre. */
  removeOlderThan(before: number): Promise<number>
}
