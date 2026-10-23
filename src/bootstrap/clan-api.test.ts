import { describe, expect, it } from 'vitest'
import type { ClanSummary, ClanView, JoinRequestView } from '@/modules/clan/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Fonde un clan au nom d'un joueur, Alice par défaut, et renvoie sa vue. */
async function found(api: TestApi, name = 'Les Loups', tag = 'LOUP', player = 'alice') {
  const res = await api.post('/api/clan/clans', { name, tag }, player)
  return ((await res.json()) as { clan: ClanView }).clan
}

/** Clan d'un joueur, et ses demandes en cours. */
async function me(api: TestApi, player = 'alice') {
  const res = await api.get('/api/clan/me', player)
  return (await res.json()) as { clan: ClanView | null; requests: JoinRequestView[] }
}

/** Fait entrer un joueur dans le clan d'Alice : il demande, Alice accepte. */
async function join(api: TestApi, clanId: string, player: string) {
  const res = await api.post(`/api/clan/clans/${clanId}/requests`, {}, player)
  const { request } = (await res.json()) as { request: JoinRequestView }
  return api.post(`/api/clan/requests/${request.id}/accept`, {}, 'alice')
}

/** Rôle de chaque membre du clan d'Alice. */
async function roles(api: TestApi) {
  const { clan } = await me(api)
  return Object.fromEntries(clan?.members.map((m) => [m.playerId, m.role]) ?? [])
}

describe('API du module Clan', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/clan/me', null)).status).toBe(401)
    expect(
      (await api.post('/api/clan/clans', { name: 'Les Loups', tag: 'LOUP' }, null)).status,
    ).toBe(401)
  })

  it('fonde un clan, dont le joueur connecté devient le chef (201)', async () => {
    const api = await createTestApi()
    const res = await api.post('/api/clan/clans', { name: ' Les Loups ', tag: 'loup' })
    expect(res.status).toBe(201)
    const { clan } = await me(api)
    expect(clan).toMatchObject({ name: 'Les Loups', tag: 'LOUP', treasury: 0, myRole: 'leader' })
    expect(clan?.members.map((m) => [m.playerId, m.role])).toEqual([['alice', 'leader']])
  })

  it('refuse un nom invalide (422), un nom ou un tag pris (409), et une entrée mal formée (400)', async () => {
    const api = await createTestApi()
    await found(api)
    expect((await api.post('/api/clan/clans', { name: 'Lo', tag: 'LO' }, 'bob')).status).toBe(422)
    expect(
      (await api.post('/api/clan/clans', { name: 'Les Loups', tag: 'OURS' }, 'bob')).status,
    ).toBe(409)
    expect(
      (await api.post('/api/clan/clans', { name: 'Les Ours', tag: 'LOUP' }, 'bob')).status,
    ).toBe(409)
    expect((await api.post('/api/clan/clans', { name: 42 }, 'bob')).status).toBe(400)
  })

  it('refuse un second clan à un joueur qui en a déjà un (409)', async () => {
    const api = await createTestApi()
    await found(api)
    expect((await api.post('/api/clan/clans', { name: 'Les Ours', tag: 'OURS' })).status).toBe(409)
  })

  it('liste les clans, avec leur nombre de membres', async () => {
    const api = await createTestApi()
    await found(api)
    await found(api, 'Les Ours', 'OURS', 'bob')
    const res = await api.get('/api/clan/clans', 'carol')
    const { clans } = (await res.json()) as { clans: ClanSummary[] }
    expect(clans.map((c) => [c.name, c.members])).toEqual([
      ['Les Loups', 1],
      ['Les Ours', 1],
    ])
  })

  it("enregistre une demande d'adhésion, et refuse un doublon (409) ou un clan inconnu (404)", async () => {
    const api = await createTestApi()
    const clan = await found(api)
    const res = await api.post(`/api/clan/clans/${clan.id}/requests`, {}, 'bob')
    expect(res.status).toBe(201)
    expect((await me(api, 'bob')).requests).toMatchObject([{ clanId: clan.id, playerName: 'bob' }])
    expect((await api.post(`/api/clan/clans/${clan.id}/requests`, {}, 'bob')).status).toBe(409)
    expect((await api.post('/api/clan/clans/inconnu/requests', {}, 'bob')).status).toBe(404)
  })

  it('présente les demandes au chef, mais pas à un simple membre (403) ni à un joueur sans clan (404)', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await api.post(`/api/clan/clans/${clan.id}/requests`, {}, 'bob')
    const res = await api.get('/api/clan/requests')
    expect(((await res.json()) as { requests: JoinRequestView[] }).requests).toMatchObject([
      { playerName: 'bob' },
    ])
    await join(api, clan.id, 'carol')
    expect((await api.get('/api/clan/requests', 'carol')).status).toBe(403)
    expect((await api.get('/api/clan/requests', 'zoe')).status).toBe(404)
  })

  it('accepte une demande : le demandeur devient membre, et ses autres demandes sont retirées', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    const other = await found(api, 'Les Ours', 'OURS', 'dave')
    await api.post(`/api/clan/clans/${other.id}/requests`, {}, 'bob')
    expect((await join(api, clan.id, 'bob')).status).toBe(200)
    expect(await roles(api)).toEqual({ alice: 'leader', bob: 'member' })
    expect((await me(api, 'bob')).requests).toEqual([])
  })

  it('refuse une demande (204), et refuse une demande adressée à un autre clan (404)', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    const res = await api.post(`/api/clan/clans/${clan.id}/requests`, {}, 'bob')
    const { request } = (await res.json()) as { request: JoinRequestView }
    await found(api, 'Les Ours', 'OURS', 'dave')
    expect((await api.post(`/api/clan/requests/${request.id}/refuse`, {}, 'dave')).status).toBe(404)
    expect((await api.post(`/api/clan/requests/${request.id}/refuse`, {})).status).toBe(204)
    expect((await me(api, 'bob')).requests).toEqual([])
  })

  it('fait expirer une demande sans réponse au bout de 7 jours', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await api.post(`/api/clan/clans/${clan.id}/requests`, {}, 'bob')
    api.advance(7 * 24 * 60)
    expect((await me(api, 'bob')).requests).toEqual([])
    const res = await api.get('/api/clan/requests')
    expect(((await res.json()) as { requests: JoinRequestView[] }).requests).toEqual([])
  })

  it('le chef nomme un officier, puis le rétrograde ; un officier ne le peut pas (403)', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await join(api, clan.id, 'bob')
    await join(api, clan.id, 'carol')
    expect((await api.post('/api/clan/members/bob/promote', {})).status).toBe(200)
    expect(await roles(api)).toMatchObject({ bob: 'officer' })
    expect((await api.post('/api/clan/members/carol/promote', {}, 'bob')).status).toBe(403)
    expect((await api.post('/api/clan/members/bob/demote', {})).status).toBe(200)
    expect(await roles(api)).toMatchObject({ bob: 'member' })
    expect((await api.post('/api/clan/members/zoe/promote', {})).status).toBe(404)
  })

  it('le chef transmet son rôle, et devient officier', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await join(api, clan.id, 'bob')
    expect((await api.post('/api/clan/members/bob/transfer-leadership', {})).status).toBe(200)
    expect(await roles(api)).toEqual({ alice: 'officer', bob: 'leader' })
    expect((await api.post('/api/clan/members/bob/transfer-leadership', {})).status).toBe(403)
  })

  it("exclut un membre ; un officier n'exclut pas le chef (403)", async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await join(api, clan.id, 'bob')
    await join(api, clan.id, 'carol')
    await api.post('/api/clan/members/bob/promote', {})
    expect((await api.post('/api/clan/members/alice/kick', {}, 'bob')).status).toBe(403)
    expect((await api.post('/api/clan/members/carol/kick', {}, 'bob')).status).toBe(200)
    expect(await roles(api)).toEqual({ alice: 'leader', bob: 'officer' })
    expect((await me(api, 'carol')).clan).toBeNull()
  })

  it('un membre quitte son clan ; le chef doit transmettre son rôle (409), sauf s’il est seul', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await join(api, clan.id, 'bob')
    expect((await api.post('/api/clan/leave', {})).status).toBe(409)
    const left = await api.post('/api/clan/leave', {}, 'bob')
    expect(await left.json()).toEqual({ dissolved: false })
    const dissolved = await api.post('/api/clan/leave', {})
    expect(await dissolved.json()).toEqual({ dissolved: true })
    const res = await api.get('/api/clan/clans')
    expect(((await res.json()) as { clans: ClanSummary[] }).clans).toEqual([])
    expect((await api.post('/api/clan/leave', {})).status).toBe(404)
  })
})
