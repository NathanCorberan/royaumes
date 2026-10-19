import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { VillageService } from './application/village-service'
import { type DomainError, FoundVillageInput, UpgradeBuildingInput } from './contracts'

const STATUS: Record<DomainError['code'], 404 | 409 | 422> = {
  NOT_FOUNDED: 404,
  ALREADY_FOUNDED: 409,
  MAX_LEVEL_REACHED: 409,
  INSUFFICIENT_RESOURCES: 422,
}

/** Adaptateur HTTP : la décision reste dans le domaine, via le service applicatif. */
export function createRealmApi(service: VillageService) {
  return new Hono<AppEnv>()
    .get('/village', async (c) => c.json({ view: await service.getView(c.var.userId) }))
    .post('/village', validateJson(FoundVillageInput), async (c) => {
      const result = await service.execute(c.var.userId, {
        type: 'FoundVillage',
        name: c.req.valid('json').name,
      })
      return result.ok
        ? c.json({ view: result.view }, 201)
        : c.json({ error: result.error }, STATUS[result.error.code])
    })
    .post('/village/upgrade', validateJson(UpgradeBuildingInput), async (c) => {
      const result = await service.execute(c.var.userId, {
        type: 'UpgradeBuilding',
        building: c.req.valid('json').building,
      })
      return result.ok
        ? c.json({ view: result.view })
        : c.json({ error: result.error }, STATUS[result.error.code])
    })
}
export type RealmApi = ReturnType<typeof createRealmApi>
