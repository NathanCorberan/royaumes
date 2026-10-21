/**
 * Règles du chat d'un clan (règle 8 de la fiche de cadrage) : seuls les membres y accèdent,
 * un message est validé, la cadence d'un membre est limitée, et un message est conservé 30 jours.
 */
import { type Clan, type ClanError, memberOf } from './clan'

/** Longueur maximale d'un message, en caractères. */
export const MESSAGE_MAX_LENGTH = 280

/** Durée de conservation d'un message : trente jours, en millisecondes. */
export const RETENTION_MS = 30 * 24 * 60 * 60_000

/** Instant avant lequel un message a dépassé sa durée de conservation. */
export const expiredBefore = (now: number) => now - RETENTION_MS

/** Nombre maximal de messages d'un même membre pendant la fenêtre de limitation. */
export const RATE_LIMIT = { messages: 5, windowMs: 30_000 }

export type ChatError =
  | { code: 'EMPTY_MESSAGE' }
  | { code: 'MESSAGE_TOO_LONG'; max: number }
  | { code: 'TOO_MANY_MESSAGES'; retryAfterMs: number }

/** Seuls les membres d'un clan lisent et écrivent dans son chat. */
export const checkChatAccess = (clan: Clan, playerId: string): ClanError | null =>
  memberOf(clan, playerId) ? null : { code: 'NOT_A_MEMBER' }

/**
 * Vérifie le texte d'un message et le normalise : les espaces de début et de fin sont
 * retirés. La longueur est comptée en caractères, et non en unités UTF-16.
 */
export function checkBody(
  body: string,
): { ok: true; body: string } | { ok: false; error: ChatError } {
  const trimmed = body.trim()
  if (trimmed.length === 0) return { ok: false, error: { code: 'EMPTY_MESSAGE' } }
  if ([...trimmed].length > MESSAGE_MAX_LENGTH) {
    return { ok: false, error: { code: 'MESSAGE_TOO_LONG', max: MESSAGE_MAX_LENGTH } }
  }
  return { ok: true, body: trimmed }
}

/**
 * Applique la limitation : recent contient les dates des messages du membre publiés
 * pendant la fenêtre qui précède now. Renvoie null si le membre peut publier,
 * sinon l'erreur, avec le délai à attendre.
 */
export function checkRate(recent: number[], now: number): ChatError | null {
  if (recent.length < RATE_LIMIT.messages) return null
  const oldest = Math.min(...recent)
  return { code: 'TOO_MANY_MESSAGES', retryAfterMs: oldest + RATE_LIMIT.windowMs - now }
}
