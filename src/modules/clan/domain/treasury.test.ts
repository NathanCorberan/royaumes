import { describe, expect, it } from 'vitest'
import type { Clan } from './clan'
import {
  checkDistribution,
  checkDonation,
  type Donation,
  MAX_AMOUNT,
  settleDonation,
} from './treasury'

const T0 = Date.UTC(2026, 0, 1)

const clan: Clan = {
  id: 'c1',
  name: 'Les Loups',
  tag: 'LOUP',
  treasury: 300,
  members: [
    { playerId: 'alice', name: 'Alice', role: 'leader', joinedAt: T0 },
    { playerId: 'bob', name: 'Bob', role: 'officer', joinedAt: T0 },
  ],
}

const pending: Donation = {
  id: 'd1',
  clanId: 'c1',
  playerId: 'bob',
  amount: 100,
  status: 'pending',
}

describe('Règle 9 - les dons au trésor', () => {
  it('un membre donne un montant entier et positif', () => {
    expect(checkDonation(clan, 'bob', 100)).toBeNull()
    for (const amount of [0, -5, 1.5, MAX_AMOUNT + 1]) {
      expect(checkDonation(clan, 'bob', amount)).toEqual({
        code: 'INVALID_AMOUNT',
        max: MAX_AMOUNT,
      })
    }
  })

  it("un joueur ne donne pas au trésor d'un clan dont il n'est pas membre", () => {
    expect(checkDonation(clan, 'zoe', 100)).toEqual({ code: 'NOT_A_MEMBER' })
  })

  it("l'or n'est crédité au trésor que si le prélèvement a réussi", () => {
    expect(settleDonation(pending, 'withdrawn', true)).toEqual({
      action: 'credit',
      status: 'credited',
    })
    expect(settleDonation(pending, 'refused', true)).toEqual({
      action: 'cancel',
      status: 'refused',
    })
  })

  it("l'or prélevé pour un clan dissous entre-temps est reversé au donateur", () => {
    expect(settleDonation(pending, 'withdrawn', false)).toEqual({
      action: 'refund',
      status: 'refunded',
    })
  })

  it('une réponse en double, pour un don déjà réglé, est ignorée', () => {
    expect(settleDonation({ ...pending, status: 'credited' }, 'withdrawn', true)).toEqual({
      action: 'ignore',
    })
  })
})

describe('Règle 10 - les distributions du trésor', () => {
  it("le chef distribue de l'or à un membre, et le trésor diminue d'autant", () => {
    expect(checkDistribution(clan, 'alice', 'bob', 200)).toEqual({ ok: true, treasury: 100 })
  })

  it('le solde du trésor ne devient jamais négatif', () => {
    expect(checkDistribution(clan, 'alice', 'bob', 301)).toEqual({
      ok: false,
      error: { code: 'INSUFFICIENT_TREASURY', available: 300 },
    })
  })

  it('seul le chef distribue, et seulement à un membre du clan', () => {
    expect(checkDistribution(clan, 'bob', 'alice', 100)).toEqual({
      ok: false,
      error: { code: 'NOT_ALLOWED' },
    })
    expect(checkDistribution(clan, 'alice', 'zoe', 100)).toEqual({
      ok: false,
      error: { code: 'NOT_A_MEMBER' },
    })
  })
})
