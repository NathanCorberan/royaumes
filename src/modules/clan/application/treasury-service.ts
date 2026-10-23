import { REALM_TOPICS } from '@/modules/realm/contracts'
import type { NewMessage } from '@/platform/outbox/outbox'
import { CLAN_TOPICS, type ClanView, type DonationView } from '../contracts'
import { memberOf } from '../domain/clan'
import {
  checkDistribution,
  checkDonation,
  type Donation,
  settleDonation,
  type TreasuryError,
} from '../domain/treasury'
import type { ClanRepository } from './clan-repository'
import type { TreasuryRepository } from './treasury-repository'

export type TreasuryResult<T> = ({ ok: true } & T) | { ok: false; error: TreasuryError }

export interface TreasuryServiceOptions {
  /** Distribution de la boîte d'envoi, déclenchée après chaque don et chaque distribution. */
  dispatch: () => Promise<unknown>
  clock?: () => number
  newId?: () => string
}

/** Identifiant du mouvement qui rembourse un don, distinct de celui de son prélèvement. */
const refundId = (donationId: string) => `${donationId}-remboursement`

/** Message de versement d'or au village d'un joueur ; le versement ne peut pas être refusé. */
const deposit = (transferId: string, playerId: string, amount: number): NewMessage => ({
  topic: REALM_TOPICS.deposit,
  payload: { transferId, playerId, resources: { gold: amount } },
})

const view = ({ id, amount, status }: Donation): DonationView => ({ id, amount, status })

/**
 * Service applicatif du trésor (règles 9 et 10 de la fiche de cadrage).
 * Un don est une saga avec le Village : l'or est prélevé dans le village du donateur, puis
 * crédité au trésor ; il est reversé au donateur si le clan a été dissous entre-temps.
 */
export function createTreasuryService(
  clans: ClanRepository,
  repo: TreasuryRepository,
  { dispatch, clock = () => Date.now(), newId = () => crypto.randomUUID() }: TreasuryServiceOptions,
) {
  /** Règle 9 : le joueur donne de l'or au trésor de son clan. */
  async function donate(
    playerId: string,
    amount: number,
  ): Promise<TreasuryResult<{ donation: DonationView }>> {
    const clan = await clans.clanOf(playerId)
    if (!clan) return { ok: false, error: { code: 'NOT_IN_CLAN' } }
    const error = checkDonation(clan, playerId, amount)
    if (error) return { ok: false, error }
    const donation: Donation = { id: newId(), clanId: clan.id, playerId, amount, status: 'pending' }
    await repo.recordDonation(donation, clock(), {
      topic: REALM_TOPICS.withdraw,
      payload: {
        // L'identifiant du don sert d'identifiant du mouvement : la réponse du Village le désigne.
        transferId: donation.id,
        playerId,
        resources: { gold: amount },
        replyTo: CLAN_TOPICS.transferResult,
      },
    })
    // Dans le cas ordinaire, la saga est terminée lorsque la réponse est renvoyée.
    await dispatch()
    return { ok: true, donation: view((await repo.donation(donation.id)) ?? donation) }
  }

  /** Règle 10 : le chef distribue de l'or du trésor à un membre du clan. */
  async function distribute(
    playerId: string,
    targetId: string,
    amount: number,
  ): Promise<TreasuryResult<{ clan: ClanView }>> {
    const clan = await clans.clanOf(playerId)
    if (!clan) return { ok: false, error: { code: 'NOT_IN_CLAN' } }
    const checked = checkDistribution(clan, playerId, targetId, amount)
    if (!checked.ok) return checked
    const distribution = {
      id: newId(),
      clanId: clan.id,
      playerId: targetId,
      amount,
      distributedAt: clock(),
    }
    if (!(await repo.distribute(distribution, deposit(distribution.id, targetId, amount)))) {
      // Une distribution simultanée a vidé le trésor : le solde à jour est indiqué.
      const fresh = await clans.clanOf(playerId)
      return {
        ok: false,
        error: { code: 'INSUFFICIENT_TREASURY', available: fresh?.treasury ?? 0 },
      }
    }
    await dispatch()
    const fresh = (await clans.clanOf(playerId)) ?? clan
    return {
      ok: true,
      clan: { ...fresh, myRole: memberOf(fresh, playerId)?.role ?? 'member' },
    }
  }

  /**
   * Étape de la saga, déclenchée par la réponse du Village. Le gestionnaire est idempotent :
   * une réponse remise deux fois ne règle le don qu'une seule fois.
   */
  async function onTransferResult(transferId: string, outcome: 'withdrawn' | 'refused') {
    const donation = await repo.donation(transferId)
    // Un don effacé avec le compte de son donateur n'a plus à être réglé.
    if (!donation) return
    const clanExists = (await clans.byId(donation.clanId)) !== null
    const step = settleDonation(donation, outcome, clanExists)
    switch (step.action) {
      case 'credit':
        await repo.settleDonation(donation.id, step.status, { credit: true, messages: [] })
        return
      case 'cancel':
        await repo.settleDonation(donation.id, step.status, { credit: false, messages: [] })
        return
      case 'refund':
        // Compensation : l'or prélevé est reversé au village du donateur.
        await repo.settleDonation(donation.id, step.status, {
          credit: false,
          messages: [deposit(refundId(donation.id), donation.playerId, donation.amount)],
        })
        return
      case 'ignore':
        return
    }
  }

  return { donate, distribute, onTransferResult }
}

export type TreasuryService = ReturnType<typeof createTreasuryService>
