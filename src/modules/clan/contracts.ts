/**
 * Entrée publique « partagée » du module Clan : utilisable par le serveur
 * comme par l'interface. Elle ne contient que des types, des schémas de
 * validation et des constantes, sans aucun code propre au serveur.
 */
import { z } from 'zod'
import type { Member, Role } from './domain/clan'

export type { ClanError, Member, Role } from './domain/clan'
export { MAX_MEMBERS, NAME_LENGTH, REQUEST_TTL_MS, ROLES } from './domain/clan'

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
