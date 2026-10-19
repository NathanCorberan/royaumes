import { describe, expect, it } from 'vitest'
import { createApi } from './create-api'

function setup() {
  let now = Date.UTC(2026, 0, 1)
  const api = createApi({ clock: () => now })
  const post = (path: string, body: unknown) =>
    api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  const advance = (minutes: number) => {
    now += minutes * 60_000
  }
  return { api, post, advance }
}

describe('API du module Village', () => {
  it("renvoie une vue nulle tant qu'aucun village n'est fondé", async () => {
    const res = await setup().api.request('/api/realm/village')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ view: null })
  })
  it('fonde un village (201) puis refuse une seconde fondation (409)', async () => {
    const { post } = setup()
    const first = await post('/api/realm/village', { name: 'Valombre' })
    expect(first.status).toBe(201)
    expect((await first.json()).view.name).toBe('Valombre')
    const second = await post('/api/realm/village', { name: 'Autre' })
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ error: { code: 'ALREADY_FOUNDED' } })
  })
  it('rejette une entrée invalide avant tout appel au service (400)', async () => {
    const { post } = setup()
    const res = await post('/api/realm/village', { name: 'V' })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_INPUT')
  })
  it('rejette un bâtiment inconnu (400)', async () => {
    const { post } = setup()
    await post('/api/realm/village', { name: 'Valombre' })
    expect((await post('/api/realm/village/upgrade', { building: 'castle' })).status).toBe(400)
  })
  it('traduit un stock insuffisant en erreur 422, puis accepte avec le temps', async () => {
    const { post, advance } = setup()
    await post('/api/realm/village', { name: 'Valombre' })
    const early = await post('/api/realm/village/upgrade', { building: 'mine' })
    expect(early.status).toBe(422)
    expect((await early.json()).error.missing).toEqual({ stone: 10 })
    advance(2)
    const later = await post('/api/realm/village/upgrade', { building: 'mine' })
    expect(later.status).toBe(200)
    expect((await later.json()).view.levels.mine).toBe(1)
  })
})
