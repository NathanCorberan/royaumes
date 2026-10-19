/** Entrée partagée : uniquement des types, schémas et fonctions pures. */
import { z } from 'zod'
import { BUILDINGS } from './domain/catalog'

export type { Building, Resource, Stock } from './domain/catalog'
export { BUILDINGS, MAX_LEVEL, RESOURCES } from './domain/catalog'
export type { DomainError, VillageView } from './domain/village'
export { stockAt } from './domain/village'

export const FoundVillageInput = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Le nom doit comporter au moins 2 caractères')
    .max(30, 'Le nom doit comporter au plus 30 caractères'),
})
export const UpgradeBuildingInput = z.object({ building: z.enum(BUILDINGS) })
