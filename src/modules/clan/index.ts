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
import { CLAN_CHANNEL_PREFIX, CLAN_MESSAGE_POSTED, clanChannel } from './contracts'
import { createDrizzleClanRepository } from './infrastructure/drizzle-clan-repository'
import { createDrizzleMessageRepository } from './infrastructure/drizzle-message-repository'

export interface ClanModuleDeps {
  /** Base de données, dans laquelle le Clan tient ses tables. */
  db: Db
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Nombre maximal de messages transmis à la fois par le canal d'un clan. */
const CHANNEL_BATCH = 100

/** Fabrique du module : assemble les adaptateurs, les services, l'API et la règle du canal. */
export function createClanModule({ db, clock }: ClanModuleDeps) {
  const clans = createDrizzleClanRepository(db)
  const service = createClanService(clans, { clock })
  const chat = createChatService(clans, createDrizzleMessageRepository(db), clock)

  // Canal du chat d'un clan : seuls ses membres peuvent l'écouter, et un joueur exclu ou parti
  // perd l'accès dès sa prochaine connexion. Comme celui de la Taverne, le canal ne lit pas le
  // journal, mais la table des messages, filtrée sur le clan désigné par le nom du canal.
  const channelPolicy: ChannelPolicy = {
    prefix: CLAN_CHANNEL_PREFIX,
    canSubscribe: (channel, userId) =>
      chat.isMember(channel.slice(CLAN_CHANNEL_PREFIX.length), userId),
    source: {
      async read(after, channel) {
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
      // Un nouvel abonné ne reçoit que les messages à venir ; l'historique est lu par l'API.
      start: () => chat.lastId(),
    },
  }

  // La tâche quotidienne applique les durées de conservation, même si personne ne visite
  // le clan : celle des messages, et celle des demandes d'adhésion.
  async function dailyTask() {
    return { messages: await chat.purge(), requests: await service.purgeRequests() }
  }

  return { api: createClanApi(service, chat), channelPolicy, dailyTask }
}

export type { ClanApi } from './api'
