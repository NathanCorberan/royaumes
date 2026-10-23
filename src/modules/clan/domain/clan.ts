/**
 * Domaine du Clan : la constitution d'un clan et la gestion de ses membres.
 * Le Clan n'utilise pas l'Event Sourcing : ses règles s'appliquent à l'état courant d'un clan,
 * lu dans ses tables. Ce fichier est écrit en TypeScript pur : il n'importe aucun autre module.
 */

/** Longueur du nom d'un clan, en caractères. */
export const NAME_LENGTH = { min: 3, max: 24 }

/** Forme du tag d'un clan : de 2 à 4 lettres majuscules. */
export const TAG_PATTERN = /^[A-Z]{2,4}$/

/** Nombre maximal de membres d'un clan. */
export const MAX_MEMBERS = 20

/** Durée de validité d'une demande d'adhésion : sept jours, en millisecondes. */
export const REQUEST_TTL_MS = 7 * 24 * 60 * 60_000

/** Rôles d'un membre, du plus élevé au plus modeste. */
export const ROLES = ['leader', 'officer', 'member'] as const
export type Role = (typeof ROLES)[number]

export interface Member {
  playerId: string
  name: string
  role: Role
  joinedAt: number
}

/** État courant d'un clan, tel que le lisent les règles. */
export interface Clan {
  id: string
  name: string
  tag: string
  /** Or du trésor commun. */
  treasury: number
  members: Member[]
}

/** Demande d'adhésion d'un joueur à un clan. */
export interface JoinRequest {
  id: string
  clanId: string
  playerId: string
  playerName: string
  requestedAt: number
}

export type ClanError =
  | { code: 'INVALID_NAME'; min: number; max: number }
  | { code: 'INVALID_TAG' }
  | { code: 'NAME_TAKEN' }
  | { code: 'TAG_TAKEN' }
  | { code: 'ALREADY_IN_CLAN' }
  | { code: 'NOT_IN_CLAN' }
  | { code: 'CLAN_FULL'; max: number }
  | { code: 'REQUEST_ALREADY_SENT' }
  | { code: 'REQUEST_EXPIRED' }
  | { code: 'NOT_ALLOWED' }
  | { code: 'NOT_A_MEMBER' }
  | { code: 'LEADER_MUST_TRANSFER' }
  | { code: 'CLAN_NOT_FOUND' }
  | { code: 'REQUEST_NOT_FOUND' }

export type Checked<T> = { ok: true; value: T } | { ok: false; error: ClanError }

const fail = (error: ClanError): { ok: false; error: ClanError } => ({ ok: false, error })

/** Membre d'un clan, ou undefined si le joueur n'en fait pas partie. */
export const memberOf = (clan: Clan, playerId: string) =>
  clan.members.find((member) => member.playerId === playerId)

// ---------------------------------------------------------------------------
// Règles 1 et 2 : fonder un clan
// ---------------------------------------------------------------------------

/** Ce que les règles doivent savoir de l'existant pour fonder un clan. */
export interface FoundingContext {
  /** Vrai si le fondateur appartient déjà à un clan. */
  inClan: boolean
  nameTaken: boolean
  tagTaken: boolean
}

/**
 * Vérifie la fondation d'un clan, et normalise son nom (espaces retirés) et son tag (majuscules).
 * Le fondateur deviendra le chef du clan.
 */
export function checkFounding(
  input: { name: string; tag: string },
  context: FoundingContext,
): Checked<{ name: string; tag: string }> {
  if (context.inClan) return fail({ code: 'ALREADY_IN_CLAN' })
  const name = input.name.trim()
  const length = [...name].length
  if (length < NAME_LENGTH.min || length > NAME_LENGTH.max) {
    return fail({ code: 'INVALID_NAME', ...NAME_LENGTH })
  }
  const tag = input.tag.trim().toUpperCase()
  if (!TAG_PATTERN.test(tag)) return fail({ code: 'INVALID_TAG' })
  if (context.nameTaken) return fail({ code: 'NAME_TAKEN' })
  if (context.tagTaken) return fail({ code: 'TAG_TAKEN' })
  return { ok: true, value: { name, tag } }
}

/** Le fondateur d'un clan en est le premier membre, et son chef. */
export const founder = (player: { id: string; name: string }, now: number): Member => ({
  playerId: player.id,
  name: player.name,
  role: 'leader',
  joinedAt: now,
})

// ---------------------------------------------------------------------------
// Règles 2, 3 et 4 : les demandes d'adhésion
// ---------------------------------------------------------------------------

/** Vrai si une demande a dépassé sa durée de validité : l'échéance est vérifiée à la lecture. */
export const isExpired = (request: JoinRequest, now: number) =>
  now >= request.requestedAt + REQUEST_TTL_MS

/**
 * Vérifie qu'un joueur peut demander à rejoindre un clan. pending contient les demandes
 * encore valides du joueur.
 */
export function checkJoinRequest(
  clan: Clan,
  context: { inClan: boolean; pending: JoinRequest[] },
): ClanError | null {
  if (context.inClan) return { code: 'ALREADY_IN_CLAN' }
  if (clan.members.length >= MAX_MEMBERS) return { code: 'CLAN_FULL', max: MAX_MEMBERS }
  if (context.pending.some((request) => request.clanId === clan.id)) {
    return { code: 'REQUEST_ALREADY_SENT' }
  }
  return null
}

/** Vrai si le rôle permet de répondre aux demandes et d'exclure de simples membres. */
const canManage = (role: Role | undefined) => role === 'leader' || role === 'officer'

/**
 * Vérifie l'acceptation d'une demande par actorId, et renvoie le nouveau membre.
 * applicantInClan est vrai si le demandeur a rejoint un autre clan entre-temps.
 */
export function checkAccept(
  clan: Clan,
  actorId: string,
  request: JoinRequest,
  context: { applicantInClan: boolean; now: number },
): Checked<Member> {
  if (!canManage(memberOf(clan, actorId)?.role)) return fail({ code: 'NOT_ALLOWED' })
  if (isExpired(request, context.now)) return fail({ code: 'REQUEST_EXPIRED' })
  if (context.applicantInClan) return fail({ code: 'ALREADY_IN_CLAN' })
  if (clan.members.length >= MAX_MEMBERS) return fail({ code: 'CLAN_FULL', max: MAX_MEMBERS })
  return {
    ok: true,
    value: {
      playerId: request.playerId,
      name: request.playerName,
      role: 'member',
      joinedAt: context.now,
    },
  }
}

/** Vérifie le refus d'une demande par actorId. */
export const checkRefuse = (clan: Clan, actorId: string): ClanError | null =>
  canManage(memberOf(clan, actorId)?.role) ? null : { code: 'NOT_ALLOWED' }

// ---------------------------------------------------------------------------
// Règles 5, 6 et 7 : les rôles, l'exclusion et le départ
// ---------------------------------------------------------------------------

/** Vérifie que actorId, chef du clan, peut agir sur un autre membre, et renvoie ce membre. */
function leaderOver(clan: Clan, actorId: string, targetId: string): Checked<Member> {
  if (memberOf(clan, actorId)?.role !== 'leader') return fail({ code: 'NOT_ALLOWED' })
  const target = memberOf(clan, targetId)
  if (!target) return fail({ code: 'NOT_A_MEMBER' })
  if (target.playerId === actorId) return fail({ code: 'NOT_ALLOWED' })
  return { ok: true, value: target }
}

/** Nomme officier un membre, ou rétrograde un officier : seul le chef le peut. */
export function checkSetRole(
  clan: Clan,
  actorId: string,
  targetId: string,
  role: 'officer' | 'member',
): Checked<Member> {
  const target = leaderOver(clan, actorId, targetId)
  if (!target.ok) return target
  return { ok: true, value: { ...target.value, role } }
}

/**
 * Transmet le rôle de chef à un autre membre : renvoie les deux membres modifiés,
 * l'ancien chef devenant officier.
 */
export function checkTransferLeadership(
  clan: Clan,
  actorId: string,
  targetId: string,
): Checked<{ former: Member; next: Member }> {
  const target = leaderOver(clan, actorId, targetId)
  if (!target.ok) return target
  const former = memberOf(clan, actorId) as Member
  return {
    ok: true,
    value: { former: { ...former, role: 'officer' }, next: { ...target.value, role: 'leader' } },
  }
}

/** Le chef exclut n'importe quel membre ; un officier n'exclut que de simples membres. */
export function checkKick(clan: Clan, actorId: string, targetId: string): ClanError | null {
  const actor = memberOf(clan, actorId)
  const target = memberOf(clan, targetId)
  if (!canManage(actor?.role)) return { code: 'NOT_ALLOWED' }
  if (!target) return { code: 'NOT_A_MEMBER' }
  if (target.playerId === actorId) return { code: 'NOT_ALLOWED' }
  if (actor?.role === 'officer' && target.role !== 'member') return { code: 'NOT_ALLOWED' }
  return null
}

/**
 * Départ d'un membre. Le chef ne part qu'après avoir transmis son rôle, sauf s'il est
 * le dernier membre : le clan est alors dissous.
 */
export function checkLeave(clan: Clan, playerId: string): Checked<{ dissolve: boolean }> {
  const member = memberOf(clan, playerId)
  if (!member) return fail({ code: 'NOT_A_MEMBER' })
  if (member.role !== 'leader') return { ok: true, value: { dissolve: false } }
  if (clan.members.length > 1) return fail({ code: 'LEADER_MUST_TRANSFER' })
  return { ok: true, value: { dissolve: true } }
}
