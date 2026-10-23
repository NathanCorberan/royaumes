/**
 * Entrée publique « partagée » du module Clan : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas de
 * validation et des constantes, sans aucun code propre au serveur.
 */
import { z } from 'zod'
import { MESSAGE_MAX_LENGTH } from './domain/chat'
import type { Member, Role } from './domain/clan'
import type { DonationStatus } from './domain/treasury'

export type { ChatError } from './domain/chat'
export { MESSAGE_MAX_LENGTH } from './domain/chat'
export type { ClanError, Member, Role } from './domain/clan'
export { MAX_MEMBERS, NAME_LENGTH, REQUEST_TTL_MS, ROLES } from './domain/clan'
export type { DonationStatus, TreasuryError } from './domain/treasury'
export { MAX_AMOUNT } from './domain/treasury'

/** Clan du joueur connecté, tel que le reçoit l'interface. */
export interface ClanView {
  id: string
  name: string
  tag: string
  treasury: number
  /** Rôle du joueur connecté dans le clan. */
  myRole: Role
  members: Member[]
}

/** Demande d'adhésion, telle que la reçoivent le demandeur, le chef et les officiers. */
export interface JoinRequestView {
  id: string
  clanId: string
  playerName: string
  requestedAt: number
  /** Instant auquel la demande expirera, faute de réponse. */
  expiresAt: number
}

/** Clan présenté dans la liste des clans. */
export interface ClanSummary {
  id: string
  name: string
  tag: string
  members: number
}

/** Corps attendu pour fonder un clan. Les longueurs exactes sont vérifiées par le domaine. */
export const FoundClanInput = z.object({
  name: z.string().max(100),
  tag: z.string().max(10),
})

/** Message du chat d'un clan, tel que le reçoivent ses membres. */
export interface ClanMessage {
  /** Identifiant croissant : il ordonne les messages, et sert de position au canal temps réel. */
  id: number
  clanId: string
  authorId: string
  authorName: string
  body: string
  postedAt: number
}

/** Corps attendu pour publier un message. La longueur exacte est vérifiée par le domaine. */
export const PostMessageInput = z.object({
  body: z.string().max(MESSAGE_MAX_LENGTH * 4),
})

/** Préfixe commun aux noms des canaux temps réel des clans. */
export const CLAN_CHANNEL_PREFIX = 'clan-'

/** Nom du canal temps réel du chat d'un clan, réservé à ses membres. */
export const clanChannel = (clanId: string) => `${CLAN_CHANNEL_PREFIX}${clanId}`

/** Type sous lequel un nouveau message est annoncé sur le canal d'un clan. */
export const CLAN_MESSAGE_POSTED = 'ClanMessagePosted'

// ---------------------------------------------------------------------------
// Le trésor : les dons et les distributions passent par des messages au Village
// ---------------------------------------------------------------------------

/** Sujets des messages que le Clan sait traiter. */
export const CLAN_TOPICS = {
  /** Réponse du Village au prélèvement de l'or d'un don. */
  transferResult: 'clan.transferResult',
} as const

/** Don d'un membre au trésor, tel que le reçoit le donateur. */
export interface DonationView {
  id: string
  amount: number
  status: DonationStatus
}

/** Corps attendu pour donner de l'or au trésor. Le montant exact est vérifié par le domaine. */
export const DonateInput = z.object({
  amount: z.number(),
})

/** Corps attendu pour distribuer de l'or du trésor à un membre du clan. */
export const DistributeInput = z.object({
  playerId: z.string().min(1),
  amount: z.number(),
})
