import { z } from 'zod'
import type { MessageHandler } from '@/platform/outbox/outbox'
import type { TreasuryService } from './application/treasury-service'
import { CLAN_TOPICS } from './contracts'

/** Réponse du Village à un mouvement de ressources (son type TransferResult, vérifié ici). */
const TransferResultMessage = z.object({
  transferId: z.string().min(1),
  outcome: z.enum(['withdrawn', 'refused']),
})

/**
 * Gestionnaires des messages adressés au Clan : les réponses du Village, qui font progresser
 * la saga des dons. Comme ceux du Marché, ils ne font que traduire un message en appel au service.
 */
export function createClanHandlers(treasury: TreasuryService): Record<string, MessageHandler> {
  return {
    [CLAN_TOPICS.transferResult]: async (message) => {
      const { transferId, outcome } = TransferResultMessage.parse(message.payload)
      await treasury.onTransferResult(transferId, outcome)
    },
  }
}
