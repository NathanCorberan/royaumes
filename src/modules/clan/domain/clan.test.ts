import { describe, expect, it } from 'vitest'
import {
  type Clan,
  checkAccept,
  checkFounding,
  checkJoinRequest,
  checkKick,
  checkLeave,
  checkRefuse,
  checkSetRole,
  checkTransferLeadership,
  founder,
  isExpired,
  type JoinRequest,
  MAX_MEMBERS,
  type Member,
  REQUEST_TTL_MS,
} from './clan'

const T0 = Date.UTC(2026, 0, 1)
const free = { inClan: false, nameTaken: false, tagTaken: false }

const member = (playerId: string, role: Member['role'] = 'member'): Member => ({
  playerId,
  name: playerId,
  role,
  joinedAt: T0,
})

/** Clan d'Alice (cheffe), avec Bob (officier) et Carol (membre). */
const clan: Clan = {
  id: 'c1',
  name: 'Les Loups',
  tag: 'LOUP',
  treasury: 0,
  members: [member('alice', 'leader'), member('bob', 'officer'), member('carol')],
}

const full: Clan = {
  ...clan,
  members: Array.from({ length: MAX_MEMBERS }, (_, i) => member(`p${i}`, i ? 'member' : 'leader')),
}

const request: JoinRequest = {
  id: 'r1',
  clanId: 'c1',
  playerId: 'dave',
  playerName: 'Dave',
  requestedAt: T0,
}

describe('Règle 1 - le nom et le tag du clan', () => {
  it('normalise le nom et met le tag en majuscules', () => {
    expect(checkFounding({ name: '  Les Loups ', tag: 'loup' }, free)).toEqual({
      ok: true,
      value: { name: 'Les Loups', tag: 'LOUP' },
    })
  })

  it('refuse un nom de moins de 3 ou de plus de 24 caractères', () => {
    const error = { code: 'INVALID_NAME', min: 3, max: 24 }
    expect(checkFounding({ name: 'Lo', tag: 'LOUP' }, free)).toEqual({ ok: false, error })
    expect(checkFounding({ name: 'L'.repeat(25), tag: 'LOUP' }, free)).toEqual({ ok: false, error })
  })

  it("refuse un tag qui n'est pas fait de 2 à 4 lettres", () => {
    for (const tag of ['L', 'LOUPS', 'L0P']) {
      expect(checkFounding({ name: 'Les Loups', tag }, free)).toEqual({
        ok: false,
        error: { code: 'INVALID_TAG' },
      })
    }
  })

  it('refuse un nom ou un tag déjà pris', () => {
    const input = { name: 'Les Loups', tag: 'LOUP' }
    expect(checkFounding(input, { ...free, nameTaken: true })).toEqual({
      ok: false,
      error: { code: 'NAME_TAKEN' },
    })
    expect(checkFounding(input, { ...free, tagTaken: true })).toEqual({
      ok: false,
      error: { code: 'TAG_TAKEN' },
    })
  })
})

describe('Règle 2 - un seul clan par joueur, et le fondateur est le chef', () => {
  it("refuse la fondation d'un clan à un joueur qui a déjà un clan", () => {
    expect(checkFounding({ name: 'Les Loups', tag: 'LOUP' }, { ...free, inClan: true })).toEqual({
      ok: false,
      error: { code: 'ALREADY_IN_CLAN' },
    })
  })

  it('fait du fondateur le chef du clan', () => {
    expect(founder({ id: 'alice', name: 'Alice' }, T0)).toEqual({
      playerId: 'alice',
      name: 'Alice',
      role: 'leader',
      joinedAt: T0,
    })
  })

  it("refuse la demande d'un joueur qui a déjà un clan, ou qui en a rejoint un entre-temps", () => {
    expect(checkJoinRequest(clan, { inClan: true, pending: [] })).toEqual({
      code: 'ALREADY_IN_CLAN',
    })
    expect(checkAccept(clan, 'alice', request, { applicantInClan: true, now: T0 })).toEqual({
      ok: false,
      error: { code: 'ALREADY_IN_CLAN' },
    })
  })
})

describe('Règle 3 - au plus 20 membres', () => {
  it("refuse une demande, et l'acceptation d'une demande, pour un clan complet", () => {
    const error = { code: 'CLAN_FULL', max: MAX_MEMBERS }
    expect(checkJoinRequest(full, { inClan: false, pending: [] })).toEqual(error)
    expect(checkAccept(full, 'p0', request, { applicantInClan: false, now: T0 })).toEqual({
      ok: false,
      error,
    })
  })
})

describe("Règle 4 - les demandes d'adhésion", () => {
  it('accepte une première demande, et refuse un doublon', () => {
    expect(checkJoinRequest(clan, { inClan: false, pending: [] })).toBeNull()
    expect(checkJoinRequest(clan, { inClan: false, pending: [request] })).toEqual({
      code: 'REQUEST_ALREADY_SENT',
    })
  })

  it('le chef ou un officier accepte une demande : le demandeur devient simple membre', () => {
    for (const actor of ['alice', 'bob']) {
      expect(checkAccept(clan, actor, request, { applicantInClan: false, now: T0 + 1 })).toEqual({
        ok: true,
        value: { playerId: 'dave', name: 'Dave', role: 'member', joinedAt: T0 + 1 },
      })
      expect(checkRefuse(clan, actor)).toBeNull()
    }
  })

  it('un simple membre ne répond pas aux demandes', () => {
    expect(checkAccept(clan, 'carol', request, { applicantInClan: false, now: T0 })).toEqual({
      ok: false,
      error: { code: 'NOT_ALLOWED' },
    })
    expect(checkRefuse(clan, 'carol')).toEqual({ code: 'NOT_ALLOWED' })
  })

  it('une demande expire au bout de 7 jours', () => {
    expect(isExpired(request, T0 + REQUEST_TTL_MS - 1)).toBe(false)
    expect(isExpired(request, T0 + REQUEST_TTL_MS)).toBe(true)
    const late = { applicantInClan: false, now: T0 + REQUEST_TTL_MS }
    expect(checkAccept(clan, 'alice', request, late)).toEqual({
      ok: false,
      error: { code: 'REQUEST_EXPIRED' },
    })
  })
})

describe('Règle 5 - les officiers et la transmission du rôle de chef', () => {
  it('le chef nomme un officier, et le rétrograde', () => {
    expect(checkSetRole(clan, 'alice', 'carol', 'officer')).toEqual({
      ok: true,
      value: { ...member('carol'), role: 'officer' },
    })
    expect(checkSetRole(clan, 'alice', 'bob', 'member')).toEqual({
      ok: true,
      value: { ...member('bob'), role: 'member' },
    })
  })

  it("un officier ne nomme ni ne rétrograde personne, et le chef n'agit que sur un membre", () => {
    expect(checkSetRole(clan, 'bob', 'carol', 'officer')).toEqual({
      ok: false,
      error: { code: 'NOT_ALLOWED' },
    })
    expect(checkSetRole(clan, 'alice', 'zoe', 'officer')).toEqual({
      ok: false,
      error: { code: 'NOT_A_MEMBER' },
    })
  })

  it('le chef transmet son rôle à un membre, et devient officier', () => {
    expect(checkTransferLeadership(clan, 'alice', 'carol')).toEqual({
      ok: true,
      value: {
        former: { ...member('alice'), role: 'officer' },
        next: { ...member('carol'), role: 'leader' },
      },
    })
    expect(checkTransferLeadership(clan, 'bob', 'carol')).toEqual({
      ok: false,
      error: { code: 'NOT_ALLOWED' },
    })
  })
})

describe("Règle 6 - l'exclusion", () => {
  it("le chef exclut n'importe quel membre", () => {
    expect(checkKick(clan, 'alice', 'bob')).toBeNull()
    expect(checkKick(clan, 'alice', 'carol')).toBeNull()
  })

  it("un officier n'exclut que de simples membres", () => {
    expect(checkKick(clan, 'bob', 'carol')).toBeNull()
    expect(checkKick(clan, 'bob', 'alice')).toEqual({ code: 'NOT_ALLOWED' })
  })

  it("un simple membre n'exclut personne, et personne ne s'exclut soi-même", () => {
    expect(checkKick(clan, 'carol', 'bob')).toEqual({ code: 'NOT_ALLOWED' })
    expect(checkKick(clan, 'alice', 'alice')).toEqual({ code: 'NOT_ALLOWED' })
  })
})

describe('Règle 7 - le départ', () => {
  it('un membre ou un officier quitte librement son clan', () => {
    expect(checkLeave(clan, 'carol')).toEqual({ ok: true, value: { dissolve: false } })
    expect(checkLeave(clan, 'bob')).toEqual({ ok: true, value: { dissolve: false } })
  })

  it("le chef doit d'abord transmettre son rôle", () => {
    expect(checkLeave(clan, 'alice')).toEqual({
      ok: false,
      error: { code: 'LEADER_MUST_TRANSFER' },
    })
  })

  it('le départ du dernier membre dissout le clan', () => {
    const alone = { ...clan, members: [member('alice', 'leader')] }
    expect(checkLeave(alone, 'alice')).toEqual({ ok: true, value: { dissolve: true } })
  })

  it("un joueur ne quitte pas un clan dont il n'est pas membre", () => {
    expect(checkLeave(clan, 'zoe')).toEqual({ ok: false, error: { code: 'NOT_A_MEMBER' } })
  })
})
