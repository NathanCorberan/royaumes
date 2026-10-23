/**
 * Entrée publique « serveur » du module Clan.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createClanApi } from './api'
import { createChatService } from './application/chat-service'
import { createClanService } from './application/clan-service'
import { createTreasuryService } from './application/treasury-service'
import {
  CLAN_CHANGED,
  CLAN_CHANNEL_PREFIX,
  CLAN_DISSOLVED,
  CLAN_MESSAGE_POSTED,
  CLAN_STATE_CHANNEL_PREFIX,
  clanChannel,
  clanStateChannel,
} from './contracts'
import { createDrizzleClanRepository } from './infrastructure/drizzle-clan-repository'
import { createDrizzleMessageRepository } from './infrastructure/drizzle-message-repository'
import { createDrizzleTreasuryRepository } from './infrastructure/drizzle-treasury-repository'
import { createClanHandlers } from './messages'
import { createClanPersonalData } from './personal-data'

export interface ClanModuleDeps {
  /** Base de données, dans laquelle le Clan tient ses tables. */
  db: Db
  /** Distribution de la boîte d'envoi, déclenchée par le Clan après les dons et les distributions. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Nombre maximal de messages transmis à la fois par le canal d'un clan. */
const CHANNEL_BATCH = 100

/**
 * Fabrique du module : assemble les adaptateurs, les services, l'API, la règle du canal
 * et les gestionnaires de messages.
 */
export function createClanModule({ db, dispatch, clock }: ClanModuleDeps) {
  const clans = createDrizzleClanRepository(db)
  const service = createClanService(clans, { clock })
  const chat = createChatService(clans, createDrizzleMessageRepository(db), clock)
  const treasury = createTreasuryService(clans, createDrizzleTreasuryRepository(db), {
    dispatch,
    clock,
  })

  /** Clan désigné par un canal de l'état d'un clan, ou null pour un canal du chat. */
  const stateOf = (channel: string) =>
    channel.startsWith(CLAN_STATE_CHANNEL_PREFIX)
      ? channel.slice(CLAN_STATE_CHANNEL_PREFIX.length)
      : null

  /**
   * Canal de l'état d'un clan : un seul événement, sans données, annonce que sa révision a
   * changé, et l'abonné relit l'état du clan auprès de l'API. La révision sert de position.
   * La dissolution est annoncée par un dernier événement, à la position la plus grande.
   */
  async function readState(clanId: string, after: number) {
    const revision = await service.revision(clanId)
    if (revision === null) {
      if (after >= Number.MAX_SAFE_INTEGER) return []
      return [stateEvent(clanId, Number.MAX_SAFE_INTEGER, CLAN_DISSOLVED)]
    }
    return revision > after ? [stateEvent(clanId, revision, CLAN_CHANGED)] : []
  }

  const stateEvent = (clanId: string, position: number, type: string) => ({
    position,
    stream: clanStateChannel(clanId),
    version: position,
    type,
    data: {},
    occurredAt: new Date(clock?.() ?? Date.now()),
  })

  // Canaux d'un clan. Le canal du chat n'est accessible qu'à ses membres ; celui de son état,
  // aussi aux joueurs qui ont demandé à le rejoindre. Un joueur exclu ou parti perd l'accès
  // dès sa prochaine connexion. Comme celui de la Taverne, le canal du chat ne lit pas le
  // journal, mais la table des messages, filtrée sur le clan désigné par le nom du canal.
  // DETTE TECHNIQUE (docs/qualite/dette-technique.md, DT-013) : l'appartenance n'est vérifiée
  // qu'à l'ouverture du flux ; un membre exclu reçoit les messages jusqu'à sa fermeture.
  const channelPolicy: ChannelPolicy = {
    prefix: CLAN_CHANNEL_PREFIX,
    canSubscribe(channel, userId) {
      const watched = stateOf(channel)
      if (watched !== null) return service.canWatch(watched, userId)
      return chat.isMember(channel.slice(CLAN_CHANNEL_PREFIX.length), userId)
    },
    source: {
      async read(after, channel) {
        const watched = stateOf(channel)
        if (watched !== null) return readState(watched, after)
        const clanId = channel.slice(CLAN_CHANNEL_PREFIX.length)
        const fresh = await chat.after(clanId, after, CHANNEL_BATCH)
        return fresh.map((message) => ({
          position: message.id,
          stream: clanChannel(clanId),
          version: message.id,
          type: CLAN_MESSAGE_POSTED,
          data: { ...message },
          occurredAt: new Date(message.postedAt),
        }))
      },
      // Un nouvel abonné ne reçoit que les changements à venir ; l'état et l'historique du chat
      // sont lus par l'API.
      async start(channel) {
        const watched = stateOf(channel)
        if (watched === null) return chat.lastId()
        return (await service.revision(watched)) ?? 0
      },
    },
  }

  // La tâche quotidienne applique les durées de conservation, même si personne ne visite
  // le clan : celle des messages, et celle des demandes d'adhésion.
  async function dailyTask() {
    return { messages: await chat.purge(), requests: await service.purgeRequests() }
  }

  return {
    api: createClanApi(service, chat, treasury),
    channelPolicy,
    dailyTask,
    handlers: createClanHandlers(treasury),
    personalData: createClanPersonalData(db),
  }
}

export type { ClanApi } from './api'
