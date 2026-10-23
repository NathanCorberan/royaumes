import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { PersonalDataContributor } from '@/platform/privacy/privacy'
import { type Clan, type Role, successorOf } from './domain/clan'
import {
  clans,
  distributions,
  donations,
  members,
  messages,
  requests,
} from './infrastructure/schema'

/**
 * Données personnelles du Clan : l'appartenance du joueur à un clan, ses demandes d'adhésion,
 * ses messages, ses dons et les distributions qu'il a reçues. Le Clan n'enregistre pas
 * d'événements : l'effacement modifie et supprime des lignes de ses tables.
 */
export function createClanPersonalData(db: Db): PersonalDataContributor {
  /** Clan du joueur, avec ses membres ; null s'il n'en a pas. */
  async function clanOf(playerId: string): Promise<Clan | null> {
    const [membership] = await db.select().from(members).where(eq(members.playerId, playerId))
    if (!membership) return null
    const [row] = await db.select().from(clans).where(eq(clans.id, membership.clanId))
    const rows = await db.select().from(members).where(eq(members.clanId, row.id))
    return { ...row, members: rows.map((m) => ({ ...m, role: m.role as Role })) }
  }

  return {
    name: 'clan',

    async export(playerId) {
      const clan = await clanOf(playerId)
      const me = clan?.members.find((member) => member.playerId === playerId)
      return {
        membership:
          clan && me
            ? { clan: clan.name, tag: clan.tag, role: me.role, joinedAt: me.joinedAt }
            : null,
        requests: await db
          .select({ clan: clans.name, requestedAt: requests.requestedAt })
          .from(requests)
          .innerJoin(clans, eq(clans.id, requests.clanId))
          .where(eq(requests.playerId, playerId)),
        messages: await db
          .select({ body: messages.body, postedAt: messages.postedAt })
          .from(messages)
          .where(eq(messages.authorId, playerId))
          .orderBy(asc(messages.id)),
        donations: await db
          .select({
            amount: donations.amount,
            status: donations.status,
            donatedAt: donations.donatedAt,
          })
          .from(donations)
          .where(eq(donations.playerId, playerId)),
        distributionsReceived: await db
          .select({ amount: distributions.amount, distributedAt: distributions.distributedAt })
          .from(distributions)
          .where(eq(distributions.playerId, playerId)),
      }
    },

    async erase(playerId) {
      await db.delete(messages).where(eq(messages.authorId, playerId))
      const requested = await db
        .delete(requests)
        .where(eq(requests.playerId, playerId))
        .returning({ clanId: requests.clanId })
      // Les dons en attente sont conservés le temps que la saga se termine : sans eux, l'or
      // prélevé dans le village ne pourrait être ni crédité ni rendu.
      await db
        .delete(donations)
        .where(and(eq(donations.playerId, playerId), ne(donations.status, 'pending')))
      await db.delete(distributions).where(eq(distributions.playerId, playerId))

      // Le joueur quitte son clan. S'il en était le chef, son rôle passe à son successeur ;
      // s'il en était le dernier membre, le clan est dissous.
      const touched = requested.map((row) => row.clanId)
      const clan = await clanOf(playerId)
      if (clan) {
        touched.push(clan.id)
        const me = clan.members.find((member) => member.playerId === playerId)
        const next = me?.role === 'leader' ? successorOf(clan, playerId) : undefined
        if (next === null) {
          await db.delete(clans).where(eq(clans.id, clan.id))
        } else {
          if (next) {
            await db
              .update(members)
              .set({ role: next.role })
              .where(eq(members.playerId, next.playerId))
          }
          await db.delete(members).where(eq(members.playerId, playerId))
        }
      }

      // Les clans concernés en sont avertis par le canal de leur état.
      if (touched.length > 0) {
        await db
          .update(clans)
          .set({ revision: sql`${clans.revision} + 1` })
          .where(inArray(clans.id, touched))
      }
    },
  }
}
