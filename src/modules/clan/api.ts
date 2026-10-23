import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { ClanService } from './application/clan-service'
import { type ClanError, FoundClanInput } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<ClanError['code'], 403 | 404 | 409 | 422> = {
  INVALID_NAME: 422,
  INVALID_TAG: 422,
  NAME_TAKEN: 409,
  TAG_TAKEN: 409,
  ALREADY_IN_CLAN: 409,
  NOT_IN_CLAN: 404,
  CLAN_FULL: 409,
  REQUEST_ALREADY_SENT: 409,
  REQUEST_EXPIRED: 409,
  NOT_ALLOWED: 403,
  NOT_A_MEMBER: 404,
  LEADER_MUST_TRANSFER: 409,
  CLAN_NOT_FOUND: 404,
  REQUEST_NOT_FOUND: 404,
}

/**
 * Sous-application Hono du module Clan, montée sur /api/clan.
 * Le joueur qui agit est toujours celui que l'authentification a identifié : les identifiants
 * présents dans les adresses désignent un clan, une demande ou un autre membre, jamais l'auteur.
 */
export function createClanApi(service: ClanService) {
  return (
    new Hono<AppEnv>()
      // Clan du joueur, et ses demandes en cours s'il n'en a pas.
      .get('/me', async (c) => c.json(await service.me(c.var.userId)))

      // Liste des clans.
      .get('/clans', async (c) => c.json({ clans: await service.list() }))

      // Fondation d'un clan.
      .post('/clans', validateJson(FoundClanInput), async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await service.found(player, c.req.valid('json'))
        return result.ok
          ? c.json({ clan: result.clan }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Demande d'adhésion à un clan.
      .post('/clans/:clanId/requests', async (c) => {
        const player = { id: c.var.userId, name: c.var.userName }
        const result = await service.requestToJoin(player, c.req.param('clanId'))
        return result.ok
          ? c.json({ request: result.request }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Demandes adressées au clan du joueur.
      .get('/requests', async (c) => {
        const result = await service.pendingRequests(c.var.userId)
        return result.ok
          ? c.json({ requests: result.requests })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/requests/:requestId/accept', async (c) => {
        const result = await service.accept(c.var.userId, c.req.param('requestId'))
        return result.ok
          ? c.json({ clan: result.clan })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/requests/:requestId/refuse', async (c) => {
        const result = await service.refuse(c.var.userId, c.req.param('requestId'))
        return result.ok
          ? c.body(null, 204)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Gestion des membres, réservée au chef et, pour l'exclusion, aux officiers.
      .post('/members/:playerId/promote', async (c) => {
        const result = await service.setRole(c.var.userId, c.req.param('playerId'), 'officer')
        return result.ok
          ? c.json({ clan: result.clan })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/members/:playerId/demote', async (c) => {
        const result = await service.setRole(c.var.userId, c.req.param('playerId'), 'member')
        return result.ok
          ? c.json({ clan: result.clan })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/members/:playerId/transfer-leadership', async (c) => {
        const result = await service.transferLeadership(c.var.userId, c.req.param('playerId'))
        return result.ok
          ? c.json({ clan: result.clan })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      .post('/members/:playerId/kick', async (c) => {
        const result = await service.kick(c.var.userId, c.req.param('playerId'))
        return result.ok
          ? c.json({ clan: result.clan })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Départ du joueur.
      .post('/leave', async (c) => {
        const result = await service.leave(c.var.userId)
        return result.ok
          ? c.json({ dissolved: result.dissolved })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

export type ClanApi = ReturnType<typeof createClanApi>
