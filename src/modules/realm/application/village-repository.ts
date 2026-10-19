import type { VillageEvent, VillageState } from '../domain/village'

/** Port de persistance : le cœur ignore la technique de stockage. */
export interface VillageRepository {
  load(userId: string): Promise<{ state: VillageState; version: number }>
  save(userId: string, expectedVersion: number, events: VillageEvent[]): Promise<void>
}

export class VersionConflictError extends Error {
  constructor(userId: string, expected: number, actual: number) {
    super(`Conflit de version pour ${userId} : attendue ${expected}, enregistrée ${actual}`)
    this.name = 'VersionConflictError'
  }
}
