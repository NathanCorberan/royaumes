import type { ClanMessage } from '../contracts'
import {
  type ChatError,
  checkBody,
  checkChatAccess,
  checkRate,
  expiredBefore,
  RATE_LIMIT,
} from '../domain/chat'
import type { ClanError } from '../domain/clan'
import type { ClanRepository } from './clan-repository'
import type { MessageRepository } from './message-repository'

/** Nombre de messages présentés à l'ouverture du chat. */
export const HISTORY_SIZE = 50

export type ChatResult<T> = ({ ok: true } & T) | { ok: false; error: ChatError | ClanError }

/** Service applicatif du chat des clans (règle 8 de la fiche de cadrage). */
export function createChatService(
  clans: ClanRepository,
  repo: MessageRepository,
  clock = () => Date.now(),
) {
  /** Publie un message dans le chat du clan du joueur, après validation et limitation. */
  async function post(
    player: { id: string; name: string },
    body: string,
  ): Promise<ChatResult<{ message: ClanMessage }>> {
    const clan = await clans.clanOf(player.id)
    if (!clan) return { ok: false, error: { code: 'NOT_IN_CLAN' } }
    const denied = checkChatAccess(clan, player.id)
    if (denied) return { ok: false, error: denied }
    const checked = checkBody(body)
    if (!checked.ok) return checked
    const now = clock()
    const limited = checkRate(await repo.postedSince(player.id, now - RATE_LIMIT.windowMs), now)
    if (limited) return { ok: false, error: limited }
    const message = await repo.add({
      clanId: clan.id,
      authorId: player.id,
      authorName: player.name,
      body: checked.body,
      postedAt: now,
    })
    return { ok: true, message }
  }

  /**
   * Derniers messages du chat du clan du joueur. Les messages qui ont dépassé leur durée de
   * conservation sont d'abord supprimés, même si la tâche quotidienne ne l'a pas encore fait.
   */
  async function latest(playerId: string): Promise<ChatResult<{ messages: ClanMessage[] }>> {
    const clan = await clans.clanOf(playerId)
    if (!clan) return { ok: false, error: { code: 'NOT_IN_CLAN' } }
    await repo.removeOlderThan(expiredBefore(clock()))
    return { ok: true, messages: await repo.latest(clan.id, HISTORY_SIZE) }
  }

  /** Vrai si le joueur est membre du clan : seuls les membres écoutent le canal du clan. */
  async function isMember(clanId: string, playerId: string) {
    const clan = await clans.clanOf(playerId)
    return clan !== null && clan.id === clanId && checkChatAccess(clan, playerId) === null
  }

  /** Tâche quotidienne : applique la durée de conservation des messages. */
  const purge = () => repo.removeOlderThan(expiredBefore(clock()))

  return {
    post,
    latest,
    isMember,
    purge,
    after: repo.after,
    lastId: repo.lastId,
  }
}

export type ChatService = ReturnType<typeof createChatService>
