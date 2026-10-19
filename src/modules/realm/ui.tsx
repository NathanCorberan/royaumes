'use client'
import { hc } from 'hono/client'
import { useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import type { RealmApi } from './api'
import {
  BUILDINGS,
  type Building,
  type DomainError,
  RESOURCES,
  type Stock,
  stockAt,
  type VillageView,
} from './contracts'

const client = hc<RealmApi>('/api/realm')
type ApiError = { code: DomainError['code'] | 'INVALID_INPUT'; message?: string }
const ERRORS: Record<ApiError['code'], string> = {
  INVALID_INPUT: 'Saisie invalide.',
  ALREADY_FOUNDED: 'Village déjà fondé.',
  NOT_FOUNDED: "Aucun village pour l'instant.",
  MAX_LEVEL_REACHED: 'Niveau maximum atteint.',
  INSUFFICIENT_RESOURCES: 'Ressources insuffisantes.',
}
function canAfford(stock: Stock, cost: Partial<Stock> | null) {
  return !!cost && Object.entries(cost).every(([r, n]) => stock[r as keyof Stock] >= (n ?? 0))
}

/** Fondation et améliorations ; la production affichée est extrapolée localement. */
export function VillageScreen() {
  const [view, setView] = useState<VillageView | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await client.village.$get()
      if (!res.ok) throw new Error('HTTP')
      setView((await res.json()).view)
      setError(null)
    } catch {
      setError('Impossible de charger le village. Réessayez.')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])

  function handle(body: { view: VillageView } | { error: ApiError }) {
    if ('error' in body) {
      setError(body.error.message ?? ERRORS[body.error.code] ?? 'Une erreur est survenue.')
    } else {
      setError(null)
      setView(body.view)
      setNow(Date.now())
    }
  }
  async function found(name: string) {
    setPending(true)
    try {
      const res = await client.village.$post({ json: { name } })
      handle(await res.json())
    } catch {
      setError('Impossible de joindre le serveur.')
    } finally {
      setPending(false)
    }
  }
  async function upgrade(building: Building) {
    setPending(true)
    try {
      const res = await client.village.upgrade.$post({ json: { building } })
      handle(await res.json())
    } catch {
      setError('Impossible de joindre le serveur.')
    } finally {
      setPending(false)
    }
  }

  const title = (
    <h1>
      <Entity kind="village" /> {view?.name ?? 'Royaumes'}
    </h1>
  )
  if (view === undefined)
    return (
      <>
        {title}
        {error && (
          <div className="panel">
            <p className="error" role="alert">
              {error}
            </p>
            <button type="button" onClick={() => void refresh()}>
              Réessayer
            </button>
          </div>
        )}
      </>
    )

  if (view === null)
    return (
      <>
        {title}
        <div className="panel">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void found(String(new FormData(e.currentTarget).get('name')))
            }}
          >
            <label htmlFor="name">Nommez votre village</label>
            <input id="name" name="name" required minLength={2} maxLength={30} />
            <button type="submit" disabled={pending}>
              Fonder
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </form>
        </div>
      </>
    )

  const stock = stockAt(view, now)
  return (
    <>
      {title}
      <section className="panel stock" aria-label="Ressources">
        {RESOURCES.map((r) => (
          <div key={r}>
            <Entity kind={r} /> {Math.floor(stock[r])}
            <small>+{view.ratesPerMinute[r]} / min</small>
          </div>
        ))}
      </section>
      <section className="panel buildings" aria-label="Bâtiments">
        {BUILDINGS.map((b) => {
          const cost = view.nextCosts[b]
          return (
            <div key={b} className="building">
              <span>
                <Entity kind={b} showLabel /> <span className="muted">niveau {view.levels[b]}</span>
              </span>
              <span className="row">
                {cost &&
                  Object.entries(cost).map(([r, n]) => (
                    <span key={r} className="muted">
                      <Entity kind={r} /> {n}
                    </span>
                  ))}
                <button
                  type="button"
                  disabled={pending || !canAfford(stock, cost)}
                  onClick={() => void upgrade(b)}
                >
                  {view.levels[b] === 0 ? 'Construire' : 'Améliorer'}
                </button>
              </span>
            </div>
          )
        })}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </>
  )
}
