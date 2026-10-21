import { describe, expect, it } from 'vitest'
import {
  checkBody,
  checkChatAccess,
  checkRate,
  expiredBefore,
  MESSAGE_MAX_LENGTH,
  RATE_LIMIT,
  RETENTION_MS,
} from './chat'
import type { Clan } from './clan'

const T0 = Date.UTC(2026, 0, 1)

const clan: Clan = {
  id: 'c1',
  name: 'Les Loups',
  tag: 'LOUP',
  treasury: 0,
  members: [{ playerId: 'alice', name: 'Alice', role: 'leader', joinedAt: T0 }],
}

describe('Règle 8 - le chat du clan', () => {
  it('seuls les membres du clan accèdent à son chat', () => {
    expect(checkChatAccess(clan, 'alice')).toBeNull()
    expect(checkChatAccess(clan, 'zoe')).toEqual({ code: 'NOT_A_MEMBER' })
  })

  it('un message comporte de 1 à 280 caractères', () => {
    expect(checkBody('  Salut le clan !  ')).toEqual({ ok: true, body: 'Salut le clan !' })
    expect(checkBody('   ')).toEqual({ ok: false, error: { code: 'EMPTY_MESSAGE' } })
    expect(checkBody('⚔'.repeat(MESSAGE_MAX_LENGTH)).ok).toBe(true)
    expect(checkBody('a'.repeat(MESSAGE_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: { code: 'MESSAGE_TOO_LONG', max: MESSAGE_MAX_LENGTH },
    })
  })

  it('un membre publie au plus 5 messages par 30 secondes', () => {
    const four = [T0, T0 + 1000, T0 + 2000, T0 + 3000]
    expect(checkRate(four, T0 + 4000)).toBeNull()
    expect(checkRate([...four, T0 + 4000], T0 + 5000)).toEqual({
      code: 'TOO_MANY_MESSAGES',
      retryAfterMs: RATE_LIMIT.windowMs - 5000,
    })
  })

  it('un message est conservé 30 jours', () => {
    expect(expiredBefore(T0 + RETENTION_MS)).toBe(T0)
    expect(RETENTION_MS).toBe(30 * 24 * 60 * 60_000)
  })
})
