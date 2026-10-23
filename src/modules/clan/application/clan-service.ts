import type { ClanView, JoinRequestView } from '../contracts'
import {
  type Clan,
  type ClanError,
  checkAccept,
  checkFounding,
  checkJoinRequest,
  checkKick,
  checkLeave,
  checkRefuse,
  checkSetRole,
  checkTransferLeadership,
  founder,
  MAX_MEMBERS,
  memberOf,
  REQUEST_TTL_MS,
} from '../domain/clan'
import type { ClanRepository } from './clan-repository'

/** Joueur connecté, au nom duquel une commande est exécutée. */
export interface Player {
  id: string
  name: string
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: ClanError }

const fail = (error: ClanError): { ok: false; error: ClanError } => ({ ok: false, error })

/** Vue d'un clan pour l'un de ses membres : son rôle y est indiqué. */
const viewOf = (clan: Clan, playerId: string): ClanView => ({
  id: clan.id,
  name: clan.name,
  tag: clan.tag,
  treasury: clan.treasury,
  myRole: memberOf(clan, playerId)?.role ?? 'member',
  members: clan.members,
})

const requestView = (request: {
  id: string
  clanId: string
  playerName: string
  requestedAt: number
}): JoinRequestView => ({
  id: request.id,
  clanId: request.clanId,
  playerName: request.playerName,
  requestedAt: request.requestedAt,
  expiresAt: request.requestedAt + REQUEST_TTL_MS,
})

export interface ClanServiceOptions {
  clock?: () => number
  newId?: () => string
}

/** Service applicatif du Clan : la constitution des clans et la gestion de leurs membres. */
export function createClanService(
  repo: ClanRepository,
  { clock = () => Date.now(), newId = () => crypto.randomUUID() }: ClanServiceOptions = {},
) {
  /**
   * Supprime les demandes expirées : l'échéance de sept jours est appliquée à chaque lecture,
   * sans tâche de fond, comme l'expiration des offres du Marché.
   */
  const purgeRequests = () => repo.removeRequestsUntil(clock() - REQUEST_TTL_MS)

  /** Clan du joueur, ou l'erreur NOT_IN_CLAN. */
  async function ownClan(playerId: string): Promise<Result<{ clan: Clan }>> {
    const clan = await repo.clanOf(playerId)
    return clan ? { ok: true, clan } : fail({ code: 'NOT_IN_CLAN' })
  }

  /** Clan du joueur, et ses demandes d'adhésion en cours. */
  async function me(playerId: string) {
    await purgeRequests()
    const clan = await repo.clanOf(playerId)
    const requests = clan ? [] : await repo.requestsOf(playerId)
    return { clan: clan ? viewOf(clan, playerId) : null, requests: requests.map(requestView) }
  }

  /** Règles 1 et 2 : fonde un clan, dont le joueur devient le chef. */
  async function found(
    player: Player,
    input: { name: string; tag: string },
  ): Promise<Result<{ clan: ClanView }>> {
    const check = async () =>
      checkFounding(input, {
        inClan: (await repo.clanOf(player.id)) !== null,
        nameTaken: await repo.isTaken('name', input.name.trim()),
        tagTaken: await repo.isTaken('tag', input.tag.trim().toUpperCase()),
      })
    const checked = await check()
    if (!checked.ok) return checked
    const now = clock()
    const clan = { id: newId(), ...checked.value, foundedAt: now }
    const leader = founder(player, now)
    // Une requête simultanée a pu prendre le nom ou le tag, ou inscrire le joueur ailleurs :
    // les règles sont alors vérifiées de nouveau, pour indiquer laquelle n'est plus respectée.
    if (!(await repo.found(clan, leader))) {
      const again = await check()
      return again.ok ? fail({ code: 'ALREADY_IN_CLAN' }) : again
    }
    await repo.removeRequestsOf(player.id)
    return { ok: true, clan: viewOf({ ...clan, treasury: 0, members: [leader] }, player.id) }
  }

  /** Règles 2, 3 et 4 : le joueur demande à rejoindre un clan. */
  async function requestToJoin(
    player: Player,
    clanId: string,
  ): Promise<Result<{ request: JoinRequestView }>> {
    await purgeRequests()
    const clan = await repo.byId(clanId)
    if (!clan) return fail({ code: 'CLAN_NOT_FOUND' })
    const error = checkJoinRequest(clan, {
      inClan: (await repo.clanOf(player.id)) !== null,
      pending: await repo.requestsOf(player.id),
    })
    if (error) return fail(error)
    const request = {
      id: newId(),
      clanId,
      playerId: player.id,
      playerName: player.name,
      requestedAt: clock(),
    }
    await repo.addRequest(request)
    return { ok: true, request: requestView(request) }
  }

  /** Demandes adressées au clan du joueur : seuls le chef et les officiers les consultent. */
  async function pendingRequests(
    playerId: string,
  ): Promise<Result<{ requests: JoinRequestView[] }>> {
    await purgeRequests()
    const own = await ownClan(playerId)
    if (!own.ok) return own
    const error = checkRefuse(own.clan, playerId)
    if (error) return fail(error)
    return { ok: true, requests: (await repo.requestsFor(own.clan.id)).map(requestView) }
  }

  /** Demande adressée au clan du joueur, avec ce clan. */
  async function requestOfOwnClan(playerId: string, requestId: string) {
    const own = await ownClan(playerId)
    if (!own.ok) return own
    const request = await repo.request(requestId)
    if (!request || request.clanId !== own.clan.id) return fail({ code: 'REQUEST_NOT_FOUND' })
    return { ok: true as const, clan: own.clan, request }
  }

  /** Règle 4 : le chef ou un officier accepte une demande. */
  async function accept(playerId: string, requestId: string): Promise<Result<{ clan: ClanView }>> {
    const found = await requestOfOwnClan(playerId, requestId)
    if (!found.ok) return found
    const { clan, request } = found
    const checked = checkAccept(clan, playerId, request, {
      applicantInClan: (await repo.clanOf(request.playerId)) !== null,
      now: clock(),
    })
    if (!checked.ok) return checked
    const added = await repo.addMember(clan.id, checked.value, MAX_MEMBERS)
    if (added === 'in-clan') return fail({ code: 'ALREADY_IN_CLAN' })
    if (added === 'full') return fail({ code: 'CLAN_FULL', max: MAX_MEMBERS })
    // Le nouveau membre n'a plus besoin de ses autres demandes.
    await repo.removeRequestsOf(request.playerId)
    return {
      ok: true,
      clan: viewOf({ ...clan, members: [...clan.members, checked.value] }, playerId),
    }
  }

  /** Règle 4 : le chef ou un officier refuse une demande. */
  async function refuse(playerId: string, requestId: string): Promise<Result> {
    const found = await requestOfOwnClan(playerId, requestId)
    if (!found.ok) return found
    const error = checkRefuse(found.clan, playerId)
    if (error) return fail(error)
    await repo.removeRequest(requestId)
    return { ok: true }
  }

  /** Règle 5 : le chef nomme un officier, ou le rétrograde. */
  async function setRole(
    playerId: string,
    targetId: string,
    role: 'officer' | 'member',
  ): Promise<Result<{ clan: ClanView }>> {
    const own = await ownClan(playerId)
    if (!own.ok) return own
    const checked = checkSetRole(own.clan, playerId, targetId, role)
    if (!checked.ok) return checked
    await repo.setRoles([checked.value])
    return { ok: true, clan: viewOf((await repo.clanOf(playerId)) as Clan, playerId) }
  }

  /** Règle 5 : le chef transmet son rôle à un autre membre, et devient officier. */
  async function transferLeadership(
    playerId: string,
    targetId: string,
  ): Promise<Result<{ clan: ClanView }>> {
    const own = await ownClan(playerId)
    if (!own.ok) return own
    const checked = checkTransferLeadership(own.clan, playerId, targetId)
    if (!checked.ok) return checked
    await repo.setRoles([checked.value.former, checked.value.next])
    return { ok: true, clan: viewOf((await repo.clanOf(playerId)) as Clan, playerId) }
  }

  /** Règle 6 : le chef ou un officier exclut un membre. */
  async function kick(playerId: string, targetId: string): Promise<Result<{ clan: ClanView }>> {
    const own = await ownClan(playerId)
    if (!own.ok) return own
    const error = checkKick(own.clan, playerId, targetId)
    if (error) return fail(error)
    await repo.removeMember(targetId)
    return { ok: true, clan: viewOf((await repo.clanOf(playerId)) as Clan, playerId) }
  }

  /** Règle 7 : le joueur quitte son clan ; le départ du dernier membre dissout le clan. */
  async function leave(playerId: string): Promise<Result<{ dissolved: boolean }>> {
    const own = await ownClan(playerId)
    if (!own.ok) return own
    const checked = checkLeave(own.clan, playerId)
    if (!checked.ok) return checked
    if (checked.value.dissolve) await repo.dissolve(own.clan.id)
    else await repo.removeMember(playerId)
    return { ok: true, dissolved: checked.value.dissolve }
  }

  /**
   * Vrai si le joueur peut suivre l'état du clan : il en est membre, ou il a demandé à le
   * rejoindre, et attend la réponse.
   */
  async function canWatch(clanId: string, playerId: string) {
    const clan = await repo.clanOf(playerId)
    if (clan) return clan.id === clanId
    return (await repo.requestsOf(playerId)).some((request) => request.clanId === clanId)
  }

  return {
    purgeRequests,
    canWatch,
    revision: (clanId: string) => repo.revision(clanId),
    me,
    list: () => repo.list(),
    found,
    requestToJoin,
    pendingRequests,
    accept,
    refuse,
    setRole,
    transferLeadership,
    kick,
    leave,
  }
}

export type ClanService = ReturnType<typeof createClanService>
