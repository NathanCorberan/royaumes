/**
 * Entrée publique « serveur » du module Clan.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */
import type { Db } from '@/platform/db/client'
import { createClanApi } from './api'
import { createClanService } from './application/clan-service'
import { createDrizzleClanRepository } from './infrastructure/drizzle-clan-repository'

export interface ClanModuleDeps {
  /** Base de données, dans laquelle le Clan tient ses tables. */
  db: Db
  /** Horloge de référence ; l'heure réelle par défaut. */
  clock?: () => number
}

/** Fabrique du module : assemble l'adaptateur, le service et l'API. */
export function createClanModule({ db, clock }: ClanModuleDeps) {
  const service = createClanService(createDrizzleClanRepository(db), { clock })
  return { api: createClanApi(service) }
}

export type { ClanApi } from './api'
