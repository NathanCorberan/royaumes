import { and, eq, gte, sql } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import { enqueue } from '@/platform/outbox/outbox'
import type { TreasuryRepository } from '../application/treasury-repository'
import type { DonationStatus } from '../domain/treasury'
import { clans, distributions, donations } from './schema'

/**
 * Adaptateur du port TreasuryRepository, fondé sur les tables du schéma clan.
 * Les messages sont confiés à la boîte d'envoi par sa fonction enqueue, dans la transaction
 * du module : le module n'accède jamais directement à la table de la plateforme.
 */
export function createDrizzleTreasuryRepository(db: Db): TreasuryRepository {
  return {
    async recordDonation(donation, donatedAt, message) {
      await db.transaction(async (tx) => {
        await tx.insert(donations).values({ ...donation, donatedAt })
        await enqueue(tx as unknown as Db, [message])
      })
    },

    async donation(donationId) {
      const [row] = await db.select().from(donations).where(eq(donations.id, donationId))
      if (!row) return null
      const { id, clanId, playerId, amount, status } = row
      return { id, clanId, playerId, amount, status: status as DonationStatus }
    },

    settleDonation(donationId, status, { credit, messages }) {
      return db.transaction(async (tx) => {
        // Le don n'est réglé que s'il est encore en attente : deux remises simultanées de la
        // même réponse ne peuvent pas le régler deux fois.
        const [settled] = await tx
          .update(donations)
          .set({ status })
          .where(and(eq(donations.id, donationId), eq(donations.status, 'pending')))
          .returning()
        if (!settled) return false
        if (credit) {
          await tx
            .update(clans)
            .set({
              treasury: sql`${clans.treasury} + ${settled.amount}`,
              revision: sql`${clans.revision} + 1`,
            })
            .where(eq(clans.id, settled.clanId))
        }
        await enqueue(tx as unknown as Db, messages)
        return true
      })
    },

    distribute(distribution, message) {
      return db.transaction(async (tx) => {
        // Le débit n'a lieu que si le trésor contient assez d'or : le solde ne devient jamais
        // négatif, même en cas de distributions simultanées.
        const debited = await tx
          .update(clans)
          .set({
            treasury: sql`${clans.treasury} - ${distribution.amount}`,
            revision: sql`${clans.revision} + 1`,
          })
          .where(and(eq(clans.id, distribution.clanId), gte(clans.treasury, distribution.amount)))
          .returning({ id: clans.id })
        if (debited.length === 0) return false
        await tx.insert(distributions).values(distribution)
        await enqueue(tx as unknown as Db, [message])
        return true
      })
    },
  }
}
