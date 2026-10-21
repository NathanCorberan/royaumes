/**
 * Règles du trésor d'un clan (règles 9 et 10 de la fiche de cadrage).
 * Un don est une saga avec le Village : l'or est d'abord prélevé dans le village du donateur,
 * puis crédité au trésor. Ce fichier décide de chaque étape, sans l'exécuter.
 */
import { type Clan, type ClanError, memberOf } from './clan'

/** Montant maximal d'un don ou d'une distribution, en or. */
export const MAX_AMOUNT = 1_000_000

export type TreasuryError =
  | ClanError
  | { code: 'INVALID_AMOUNT'; max: number }
  | { code: 'INSUFFICIENT_TREASURY'; available: number }

/** États d'un don ; les trois derniers sont finaux. */
export type DonationStatus = 'pending' | 'credited' | 'refused' | 'refunded'

export interface Donation {
  id: string
  clanId: string
  playerId: string
  amount: number
  status: DonationStatus
}

const checkAmount = (amount: number): TreasuryError | null =>
  Number.isInteger(amount) && amount > 0 && amount <= MAX_AMOUNT
    ? null
    : { code: 'INVALID_AMOUNT', max: MAX_AMOUNT }

/** Règle 9 : seul un membre donne au trésor de son clan, un montant entier et positif. */
export function checkDonation(clan: Clan, playerId: string, amount: number): TreasuryError | null {
  if (!memberOf(clan, playerId)) return { code: 'NOT_A_MEMBER' }
  return checkAmount(amount)
}

/** Ce qu'il faut faire d'un don, une fois connue la réponse du Village. */
export type DonationStep =
  /** L'or a été prélevé : il est crédité au trésor. */
  | { action: 'credit'; status: 'credited' }
  /** Le village n'avait pas assez d'or : le don est annulé, et rien n'est crédité. */
  | { action: 'cancel'; status: 'refused' }
  /** L'or a été prélevé, mais le clan a été dissous entre-temps : il est reversé au donateur. */
  | { action: 'refund'; status: 'refunded' }
  /** Le don a déjà été réglé : la réponse est un doublon, elle est ignorée. */
  | { action: 'ignore' }

/**
 * Règle 9 : l'or n'est crédité au trésor que si le prélèvement a réussi.
 * clanExists est faux si le clan a été dissous pendant le prélèvement.
 */
export function settleDonation(
  donation: Donation,
  outcome: 'withdrawn' | 'refused',
  clanExists: boolean,
): DonationStep {
  if (donation.status !== 'pending') return { action: 'ignore' }
  if (outcome === 'refused') return { action: 'cancel', status: 'refused' }
  if (!clanExists) return { action: 'refund', status: 'refunded' }
  return { action: 'credit', status: 'credited' }
}

/**
 * Règle 10 : seul le chef distribue de l'or du trésor, à un membre du clan, et le solde
 * du trésor ne devient jamais négatif. Renvoie le nouveau solde.
 */
export function checkDistribution(
  clan: Clan,
  actorId: string,
  targetId: string,
  amount: number,
): { ok: true; treasury: number } | { ok: false; error: TreasuryError } {
  if (memberOf(clan, actorId)?.role !== 'leader') {
    return { ok: false, error: { code: 'NOT_ALLOWED' } }
  }
  if (!memberOf(clan, targetId)) return { ok: false, error: { code: 'NOT_A_MEMBER' } }
  const invalid = checkAmount(amount)
  if (invalid) return { ok: false, error: invalid }
  if (amount > clan.treasury) {
    return { ok: false, error: { code: 'INSUFFICIENT_TREASURY', available: clan.treasury } }
  }
  return { ok: true, treasury: clan.treasury - amount }
}
