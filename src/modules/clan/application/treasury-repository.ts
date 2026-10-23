import type { NewMessage } from '@/platform/outbox/outbox'
import type { Donation, DonationStatus } from '../domain/treasury'

/** Distribution de l'or du trésor à un membre. */
export interface Distribution {
  id: string
  clanId: string
  playerId: string
  amount: number
  distributedAt: number
}

/**
 * Port de persistance du trésor, défini par la couche application.
 * Chaque modification est enregistrée avec les messages qu'elle déclenche, dans une même
 * transaction : un message n'est jamais envoyé pour une modification annulée, et inversement.
 */
export interface TreasuryRepository {
  /** Enregistre un don en attente, avec le message de prélèvement adressé au Village. */
  recordDonation(donation: Donation, donatedAt: number, message: NewMessage): Promise<void>
  /** Don désigné par son identifiant ; null s'il n'existe pas. */
  donation(donationId: string): Promise<Donation | null>
  /**
   * Règle un don en attente : il prend son état final, l'or est crédité au trésor si credit
   * est vrai, et les messages sont enregistrés. Renvoie faux si le don était déjà réglé :
   * la réponse du Village est alors un doublon, et rien n'est modifié.
   */
  settleDonation(
    donationId: string,
    status: Exclude<DonationStatus, 'pending'>,
    effects: { credit: boolean; messages: NewMessage[] },
  ): Promise<boolean>
  /**
   * Débite le trésor et enregistre la distribution, avec le message de versement adressé au
   * Village. Renvoie faux si le trésor ne contient plus assez d'or : une distribution
   * simultanée l'a vidé entre-temps, et rien n'est modifié.
   */
  distribute(distribution: Distribution, message: NewMessage): Promise<boolean>
}
