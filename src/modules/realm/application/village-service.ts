import {
  type DomainError,
  decide,
  toView,
  type VillageCommand,
  type VillageView,
} from '../domain/village'
import type { VillageRepository } from './village-repository'

export type CommandResult = { ok: true; view: VillageView } | { ok: false; error: DomainError }

/** Orchestre les cas d'utilisation avec un stockage et une horloge injectés. */
export function createVillageService(repo: VillageRepository, clock = () => Date.now()) {
  async function execute(userId: string, command: VillageCommand): Promise<CommandResult> {
    const { state, version } = await repo.load(userId)
    const now = clock()
    const decision = decide(state, command, now)
    if (!decision.ok) return decision
    await repo.save(userId, version, decision.events)
    const updated = await repo.load(userId)
    return { ok: true, view: toView(updated.state, now) }
  }

  async function getView(userId: string): Promise<VillageView | null> {
    const { state } = await repo.load(userId)
    return state.founded ? toView(state, clock()) : null
  }
  return { execute, getView }
}

export type VillageService = ReturnType<typeof createVillageService>
