import { asc, count, eq, lte, TransactionRollbackError } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ClanRepository } from '../application/clan-repository'
import type { Clan, Member, Role } from '../domain/clan'
import { clans, members, requests } from './schema'

/** Adaptateur du port ClanRepository, fondé sur les tables du schéma clan. */
export function createDrizzleClanRepository(db: Db): ClanRepository {
  /** Clan complet, avec ses membres du plus ancien au plus récent. */
  async function load(clanId: string): Promise<Clan | null> {
    const [row] = await db.select().from(clans).where(eq(clans.id, clanId))
    if (!row) return null
    const rows = await db
      .select()
      .from(members)
      .where(eq(members.clanId, clanId))
      .orderBy(asc(members.joinedAt), asc(members.playerId))
    return {
      id: row.id,
      name: row.name,
      tag: row.tag,
      treasury: row.treasury,
      members: rows.map(({ playerId, name, role, joinedAt }) => ({
        playerId,
        name,
        role: role as Role,
        joinedAt,
      })),
    }
  }

  const toRow = (clanId: string, member: Member) => ({ ...member, clanId })

  return {
    async clanOf(playerId) {
      const [row] = await db
        .select({ clanId: members.clanId })
        .from(members)
        .where(eq(members.playerId, playerId))
      return row ? load(row.clanId) : null
    },

    byId: load,

    list() {
      return db
        .select({
          id: clans.id,
          name: clans.name,
          tag: clans.tag,
          members: count(members.playerId),
        })
        .from(clans)
        .leftJoin(members, eq(members.clanId, clans.id))
        .groupBy(clans.id)
        .orderBy(asc(clans.name))
    },

    async isTaken(field, value) {
      const column = field === 'name' ? clans.name : clans.tag
      const [row] = await db.select({ id: clans.id }).from(clans).where(eq(column, value))
      return row !== undefined
    },

    found(clan, leader) {
      // Les contraintes d'unicité de la base départagent les requêtes simultanées :
      // si le clan ou le chef ne peut pas être inscrit, la transaction est annulée.
      return db
        .transaction(async (tx) => {
          const created = await tx.insert(clans).values(clan).onConflictDoNothing().returning()
          if (created.length === 0) tx.rollback()
          const joined = await tx
            .insert(members)
            .values(toRow(clan.id, leader))
            .onConflictDoNothing()
            .returning()
          if (joined.length === 0) tx.rollback()
          return true
        })
        .catch((error: unknown) => {
          if (error instanceof TransactionRollbackError) return false
          throw error
        })
    },

    async addMember(clanId, member, max) {
      return db.transaction(async (tx) => {
        // Le clan est verrouillé jusqu'à la fin de la transaction : une acceptation simultanée
        // attend celle-ci, et compte donc le membre qu'elle vient d'ajouter.
        await tx.select({ id: clans.id }).from(clans).where(eq(clans.id, clanId)).for('update')
        const [{ total }] = await tx
          .select({ total: count() })
          .from(members)
          .where(eq(members.clanId, clanId))
        if (total >= max) return 'full'
        const joined = await tx
          .insert(members)
          .values(toRow(clanId, member))
          .onConflictDoNothing()
          .returning()
        return joined.length > 0 ? 'added' : 'in-clan'
      })
    },

    async setRoles(changed) {
      await db.transaction(async (tx) => {
        for (const member of changed) {
          await tx
            .update(members)
            .set({ role: member.role })
            .where(eq(members.playerId, member.playerId))
        }
      })
    },

    async removeMember(playerId) {
      await db.delete(members).where(eq(members.playerId, playerId))
    },

    async dissolve(clanId) {
      // Les membres, les demandes et les messages sont supprimés en cascade.
      await db.delete(clans).where(eq(clans.id, clanId))
    },

    async addRequest(request) {
      await db.insert(requests).values(request)
    },

    async request(requestId) {
      const [row] = await db.select().from(requests).where(eq(requests.id, requestId))
      return row ?? null
    },

    requestsOf(playerId) {
      return db.select().from(requests).where(eq(requests.playerId, playerId))
    },

    requestsFor(clanId) {
      return db
        .select()
        .from(requests)
        .where(eq(requests.clanId, clanId))
        .orderBy(asc(requests.requestedAt))
    },

    async removeRequest(requestId) {
      await db.delete(requests).where(eq(requests.id, requestId))
    },

    async removeRequestsOf(playerId) {
      await db.delete(requests).where(eq(requests.playerId, playerId))
    },

    async removeRequestsUntil(at) {
      const removed = await db
        .delete(requests)
        .where(lte(requests.requestedAt, at))
        .returning({ id: requests.id })
      return removed.length
    },
  }
}
