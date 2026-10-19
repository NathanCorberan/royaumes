/** Entrée publique serveur : assemble le module et ses adaptateurs. */
import { createRealmApi } from './api'
import { createVillageService } from './application/village-service'
import { createInMemoryVillageRepository } from './infrastructure/in-memory-village-repository'

export interface RealmModuleDeps {
  clock?: () => number
}

export function createRealmModule({ clock }: RealmModuleDeps = {}) {
  // DETTE TECHNIQUE DT-002 (docs/qualite/dette-technique.md) : stockage en mémoire,
  // remplacé au TD3 par le journal d'événements.
  const repo = createInMemoryVillageRepository()
  const service = createVillageService(repo, clock)
  return { api: createRealmApi(service) }
}
export type { RealmApi } from './api'
