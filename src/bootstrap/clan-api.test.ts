import { describe, expect, it } from 'vitest'
import type { ClanMessage, ClanSummary, ClanView, JoinRequestView } from '@/modules/clan/contracts'
import { donations } from '@/modules/clan/infrastructure/schema'
import { REALM_TOPICS, type Stock } from '@/modules/realm/contracts'
import { enqueue } from '@/platform/outbox/outbox'
import { createTestApi, TEST_CRON_SECRET } from './testing'

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

describe('API du module Clan - le chat', () => {
  /** Publie un message dans le chat du clan d'un joueur, Alice par défaut. */
  const say = (api: TestApi, body: string, player = 'alice') =>
    api.post('/api/clan/messages', { body }, player)

  /** Messages du chat, tels que l'API les renvoie à un joueur. */
  async function history(api: TestApi, player = 'alice') {
    const res = await api.get('/api/clan/messages', player)
    return ((await res.json()) as { messages: ClanMessage[] }).messages
  }

  it('publie les messages au nom du membre connecté, et les présente dans l’ordre', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await join(api, clan.id, 'bob')
    expect((await say(api, 'Bienvenue Bob')).status).toBe(201)
    await say(api, 'Merci !', 'bob')
    expect((await history(api, 'bob')).map((m) => [m.authorName, m.body])).toEqual([
      ['alice', 'Bienvenue Bob'],
      ['bob', 'Merci !'],
    ])
  })

  it("réserve le chat aux membres : un joueur sans clan ne lit ni n'écrit (404)", async () => {
    const api = await createTestApi()
    await found(api)
    expect((await api.get('/api/clan/messages', 'zoe')).status).toBe(404)
    expect((await say(api, 'Bonjour ?', 'zoe')).status).toBe(404)
  })

  it("sépare les chats des clans : un membre ne lit pas le chat d'un autre clan", async () => {
    const api = await createTestApi()
    await found(api)
    await found(api, 'Les Ours', 'OURS', 'bob')
    await say(api, 'Message des Loups')
    expect(await history(api, 'bob')).toEqual([])
  })

  it('refuse un message vide ou trop long (422)', async () => {
    const api = await createTestApi()
    await found(api)
    expect((await say(api, '   ')).status).toBe(422)
    expect((await say(api, 'a'.repeat(281))).status).toBe(422)
    expect(await history(api)).toEqual([])
  })

  it('limite le nombre de messages par membre (429)', async () => {
    const api = await createTestApi()
    await found(api)
    for (let i = 1; i <= 5; i++) expect((await say(api, `Message ${i}`)).status).toBe(201)
    const refused = await say(api, 'Message 6')
    expect(refused.status).toBe(429)
    expect(refused.headers.get('retry-after')).toBe('30')
  })

  it('supprime les messages au bout de 30 jours, à la lecture comme par la tâche quotidienne', async () => {
    const api = await createTestApi()
    await found(api)
    await say(api, 'Ancien message')
    api.advance(30 * 24 * 60 + 1)
    expect(await history(api)).toEqual([])

    await say(api, 'Autre message')
    api.advance(30 * 24 * 60 + 1)
    const res = await api.api.request('/api/cron/daily', {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    })
    expect(((await res.json()) as { clan: unknown }).clan).toEqual({
      ok: true,
      result: { messages: 1, requests: 0 },
    })
  })

  it('diffuse les messages sur le canal du clan, réservé à ses membres (403)', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await join(api, clan.id, 'bob')
    await say(api, 'Premier')
    await say(api, 'Second', 'bob')

    const res = await api.get(`/api/stream/clan-${clan.id}/events?after=1`, 'bob')
    const { events } = (await res.json()) as {
      events: { position: number; type: string; data: ClanMessage }[]
    }
    expect(events).toMatchObject([
      { position: 2, type: 'ClanMessagePosted', data: { authorName: 'bob', body: 'Second' } },
    ])
    expect((await api.get(`/api/stream/clan-${clan.id}/events`, 'zoe')).status).toBe(403)
    // Un membre exclu perd aussitôt l'accès au canal.
    await api.post('/api/clan/members/bob/kick', {})
    expect((await api.get(`/api/stream/clan-${clan.id}/events`, 'bob')).status).toBe(403)
  })

  it("ne diffuse sur le canal d'un clan que ses propres messages", async () => {
    const api = await createTestApi()
    const loups = await found(api)
    await found(api, 'Les Ours', 'OURS', 'bob')
    await say(api, 'Message des Ours', 'bob')
    await say(api, 'Message des Loups')
    const res = await api.get(`/api/stream/clan-${loups.id}/events?after=0`)
    const { events } = (await res.json()) as { events: { data: ClanMessage }[] }
    expect(events.map((e) => e.data.body)).toEqual(['Message des Loups'])
  })
})

describe('API du module Clan - le trésor', () => {
  /** Distribue la boîte d'envoi, comme la tâche planifiée. */
  const dispatch = (api: TestApi) =>
    api.api.request('/api/cron/daily', {
      headers: { authorization: `Bearer ${TEST_CRON_SECRET}` },
    })

  /** Or du village d'un joueur. */
  async function goldOf(api: TestApi, player: string) {
    const res = await api.get('/api/realm/village', player)
    return ((await res.json()) as { view: { stock: Stock } }).view.stock.gold
  }

  /** Fonde le village d'un joueur, puis lui verse de l'or par un message adressé au Village. */
  async function villageWithGold(api: TestApi, player: string, gold: number) {
    await api.post('/api/realm/village', { name: `Village de ${player}` }, player)
    await enqueue(api.db, [
      {
        topic: REALM_TOPICS.deposit,
        payload: { transferId: `cadeau-${player}`, playerId: player, resources: { gold } },
      },
    ])
    await dispatch(api)
  }

  /** Clan d'Alice, avec Bob ; chacun dispose de 500 or dans son village. */
  async function clanWithGold() {
    const api = await createTestApi()
    await villageWithGold(api, 'alice', 500)
    await villageWithGold(api, 'bob', 500)
    const clan = await found(api)
    await join(api, clan.id, 'bob')
    return { api, clan }
  }

  const donate = (api: TestApi, amount: number, player = 'alice') =>
    api.post('/api/clan/treasury/donations', { amount }, player)

  it("prélève l'or du don dans le village, puis le crédite au trésor (201)", async () => {
    const { api } = await clanWithGold()
    const res = await donate(api, 200, 'bob')
    expect(res.status).toBe(201)
    expect(((await res.json()) as { donation: { status: string } }).donation.status).toBe(
      'credited',
    )
    expect(await goldOf(api, 'bob')).toBe(300)
    expect((await me(api)).clan?.treasury).toBe(200)
  })

  it("annule le don si le village n'a pas assez d'or, sans rien créditer", async () => {
    const { api } = await clanWithGold()
    const res = await donate(api, 800)
    expect(((await res.json()) as { donation: { status: string } }).donation.status).toBe('refused')
    expect(await goldOf(api, 'alice')).toBe(500)
    expect((await me(api)).clan?.treasury).toBe(0)
  })

  it('refuse un montant invalide (422), une entrée mal formée (400) et un joueur sans clan (404)', async () => {
    const { api } = await clanWithGold()
    expect((await donate(api, 0)).status).toBe(422)
    expect((await donate(api, 1.5)).status).toBe(422)
    expect((await api.post('/api/clan/treasury/donations', { amount: '10' })).status).toBe(400)
    expect((await donate(api, 10, 'zoe')).status).toBe(404)
  })

  it("reverse l'or au donateur si le clan a été dissous pendant le prélèvement", async () => {
    const api = await createTestApi()
    await villageWithGold(api, 'alice', 500)
    // Don en attente pour un clan dissous depuis : le Village répond que l'or a été prélevé.
    await api.db.insert(donations).values({
      id: 'don-1',
      clanId: 'clan-dissous',
      playerId: 'alice',
      amount: 100,
      status: 'pending',
      donatedAt: 0,
    })
    const reply = { transferId: 'don-1', outcome: 'withdrawn' }
    await enqueue(api.db, [{ topic: 'clan.transferResult', payload: reply }])
    await dispatch(api)
    expect(await goldOf(api, 'alice')).toBe(600)
    const [row] = await api.db.select().from(donations)
    expect(row.status).toBe('refunded')
  })

  it('ne crédite un don qu’une seule fois, même si la réponse du Village est remise deux fois', async () => {
    const { api, clan } = await clanWithGold()
    await api.db.insert(donations).values({
      id: 'don-1',
      clanId: clan.id,
      playerId: 'alice',
      amount: 100,
      status: 'pending',
      donatedAt: 0,
    })
    const reply = { transferId: 'don-1', outcome: 'withdrawn' }
    await enqueue(api.db, [
      { topic: 'clan.transferResult', payload: reply },
      { topic: 'clan.transferResult', payload: reply },
    ])
    await dispatch(api)
    expect((await me(api)).clan?.treasury).toBe(100)
  })

  it("le chef distribue de l'or du trésor à un membre, qui le reçoit dans son village (201)", async () => {
    const { api } = await clanWithGold()
    await donate(api, 300)
    const res = await api.post('/api/clan/treasury/distributions', { playerId: 'bob', amount: 120 })
    expect(res.status).toBe(201)
    expect(((await res.json()) as { clan: ClanView }).clan.treasury).toBe(180)
    expect(await goldOf(api, 'bob')).toBe(620)
  })

  it('refuse une distribution au-delà du trésor (409), par un simple membre (403) ou à un inconnu (404)', async () => {
    const { api } = await clanWithGold()
    await donate(api, 100)
    const distribute = (playerId: string, amount: number, player = 'alice') =>
      api.post('/api/clan/treasury/distributions', { playerId, amount }, player)
    const tooMuch = await distribute('bob', 101)
    expect(tooMuch.status).toBe(409)
    expect(await tooMuch.json()).toEqual({
      error: { code: 'INSUFFICIENT_TREASURY', available: 100 },
    })
    expect((await distribute('alice', 10, 'bob')).status).toBe(403)
    expect((await distribute('zoe', 10)).status).toBe(404)
    expect((await me(api)).clan?.treasury).toBe(100)
  })
})

describe('API du module Clan - les données personnelles', () => {
  /** Efface le compte d'un joueur. */
  const erase = (api: TestApi, player: string) =>
    api.api.request('/api/account', { method: 'DELETE', headers: { 'x-test-user': player } })

  it("exporte l'appartenance, les demandes et les messages du joueur, sans ceux des autres", async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await found(api, 'Les Ours', 'OURS', 'dave')
    await join(api, clan.id, 'bob')
    await api.post('/api/clan/messages', { body: 'Salut le clan' }, 'bob')
    await api.post('/api/clan/messages', { body: 'Bienvenue Bob' })

    const res = await api.get('/api/account/export', 'bob')
    const { sections } = (await res.json()) as { sections: { clan: Record<string, unknown> } }
    expect(sections.clan).toMatchObject({
      membership: { clan: 'Les Loups', tag: 'LOUP', role: 'member' },
      messages: [{ body: 'Salut le clan' }],
      donations: [],
      distributionsReceived: [],
    })
    expect(JSON.stringify(sections.clan)).not.toContain('Bienvenue Bob')
  })

  it('efface le compte du chef : son rôle passe à son successeur, ses messages disparaissent', async () => {
    const api = await createTestApi()
    const clan = await found(api)
    await join(api, clan.id, 'bob')
    await join(api, clan.id, 'carol')
    await api.post('/api/clan/members/carol/promote', {})
    await api.post('/api/clan/messages', { body: 'Message d’Alice' })
    await api.post('/api/clan/messages', { body: 'Message de Bob' }, 'bob')

    expect((await erase(api, 'alice')).status).toBe(200)
    const view = (await me(api, 'bob')).clan
    expect(view?.members.map((m) => [m.playerId, m.role])).toEqual([
      ['bob', 'member'],
      ['carol', 'leader'],
    ])
    const res = await api.get('/api/clan/messages', 'bob')
    const { messages } = (await res.json()) as { messages: ClanMessage[] }
    expect(messages.map((m) => m.body)).toEqual(['Message de Bob'])
  })

  it('efface le compte du dernier membre : le clan est dissous', async () => {
    const api = await createTestApi()
    await found(api)
    await erase(api, 'alice')
    const res = await api.get('/api/clan/clans', 'bob')
    expect(((await res.json()) as { clans: ClanSummary[] }).clans).toEqual([])
  })
})
