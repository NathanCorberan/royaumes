'use client'
import { hc } from 'hono/client'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Entity } from '@/ui/entity'
import type { ClanApi } from './api'
import {
  type ClanError,
  type ClanSummary,
  type ClanView,
  type JoinRequestView,
  MAX_MEMBERS,
  NAME_LENGTH,
  type Role,
} from './contracts'

/** Client HTTP typé, déduit de la sous-application Hono du module. */
const client = hc<ClanApi>('/api/clan')

/** Libellé de chaque rôle. */
const ROLE_LABELS: Record<Role, string> = {
  leader: 'Chef',
  officer: 'Officier',
  member: 'Membre',
}

/** Message affiché au joueur pour chaque erreur. */
function errorText(error: ClanError | { code: 'INVALID_INPUT' }): string {
  switch (error.code) {
    case 'INVALID_NAME':
      return `Le nom doit comporter de ${error.min} à ${error.max} caractères.`
    case 'INVALID_TAG':
      return 'Le tag doit comporter de 2 à 4 lettres.'
    case 'NAME_TAKEN':
      return 'Ce nom est déjà pris.'
    case 'TAG_TAKEN':
      return 'Ce tag est déjà pris.'
    case 'ALREADY_IN_CLAN':
      return 'Ce joueur appartient déjà à un clan.'
    case 'NOT_IN_CLAN':
      return "Vous n'appartenez à aucun clan."
    case 'CLAN_FULL':
      return `Le clan est complet (${error.max} membres).`
    case 'REQUEST_ALREADY_SENT':
      return 'Vous avez déjà demandé à rejoindre ce clan.'
    case 'REQUEST_EXPIRED':
      return 'Cette demande a expiré.'
    case 'NOT_ALLOWED':
      return 'Votre rôle ne vous permet pas de faire cela.'
    case 'NOT_A_MEMBER':
      return "Ce joueur n'est pas membre du clan."
    case 'LEADER_MUST_TRANSFER':
      return 'Transmettez votre rôle de chef avant de quitter le clan.'
    case 'CLAN_NOT_FOUND':
      return "Ce clan n'existe plus."
    case 'REQUEST_NOT_FOUND':
      return "Cette demande n'existe plus."
    case 'INVALID_INPUT':
      return 'Saisie invalide.'
  }
}

/** Date d'expiration d'une demande, au format local. */
const dateOf = (at: number) => new Date(at).toLocaleDateString('fr-FR')

/** Écran du Clan : le clan du joueur, ou les clans qu'il peut fonder ou rejoindre. */
export function ClanScreen() {
  const [clan, setClan] = useState<ClanView | null>(null)
  const [mine, setMine] = useState<JoinRequestView[]>([])
  const [clans, setClans] = useState<ClanSummary[]>([])
  const [pending, setPending] = useState<JoinRequestView[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // REQUÊTES : le clan du joueur ; selon le cas, les demandes reçues, ou la liste des clans.
  const refresh = useCallback(async () => {
    const res = await client.me.$get()
    if (!res.ok) return
    const me = await res.json()
    setClan(me.clan)
    setMine(me.requests)
    if (me.clan && me.clan.myRole !== 'member') {
      const received = await client.requests.$get()
      const body = await received.json()
      setPending('requests' in body ? body.requests : [])
    } else {
      setPending([])
    }
    if (!me.clan) setClans((await (await client.clans.$get()).json()).clans)
    setLoaded(true)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Exécute une commande, affiche son erreur éventuelle, puis relit l'état du clan. */
  async function run(command: () => Promise<Response>) {
    const res = await command()
    const body = res.status === 204 ? {} : await res.json()
    setError('error' in body ? errorText(body.error as ClanError) : null)
    await refresh()
  }

  if (!loaded) return <p className="muted">Chargement...</p>

  return (
    <>
      <h1>
        <Entity kind="clan" /> {clan ? `${clan.name} [${clan.tag}]` : 'Clans'}
      </h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {clan ? (
        <ClanPanel clan={clan} pending={pending} run={run} />
      ) : (
        <NoClan clans={clans} mine={mine} run={run} />
      )}
    </>
  )
}

type Run = (command: () => Promise<Response>) => Promise<void>

/** Le clan du joueur : ses membres, les demandes reçues, et les actions permises par son rôle. */
function ClanPanel({
  clan,
  pending,
  run,
}: {
  clan: ClanView
  pending: JoinRequestView[]
  run: Run
}) {
  const leader = clan.myRole === 'leader'
  const manager = clan.myRole !== 'member'
  const param = (playerId: string) => ({ param: { playerId } })

  return (
    <>
      <section className="panel" aria-label="Membres">
        <h2>
          Membres ({clan.members.length}/{MAX_MEMBERS})
        </h2>
        <ul>
          {clan.members.map((member) => (
            <li key={member.playerId} className="row">
              <strong>{member.name}</strong>
              <span className="muted">{ROLE_LABELS[member.role]}</span>
              {leader && member.role === 'member' && (
                <button
                  type="button"
                  onClick={() =>
                    run(() => client.members[':playerId'].promote.$post(param(member.playerId)))
                  }
                >
                  Nommer officier
                </button>
              )}
              {leader && member.role === 'officer' && (
                <button
                  type="button"
                  onClick={() =>
                    run(() => client.members[':playerId'].demote.$post(param(member.playerId)))
                  }
                >
                  Rétrograder
                </button>
              )}
              {leader && member.role !== 'leader' && (
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      client.members[':playerId']['transfer-leadership'].$post(
                        param(member.playerId),
                      ),
                    )
                  }
                >
                  Transmettre le rôle de chef
                </button>
              )}
              {manager && member.role !== 'leader' && (leader || member.role === 'member') && (
                <button
                  type="button"
                  onClick={() =>
                    run(() => client.members[':playerId'].kick.$post(param(member.playerId)))
                  }
                >
                  Exclure
                </button>
              )}
            </li>
          ))}
        </ul>
        <button type="button" className="link" onClick={() => run(() => client.leave.$post())}>
          Quitter le clan
        </button>
      </section>

      {manager && (
        <section className="panel" aria-label="Demandes d'adhésion">
          <h2>Demandes d'adhésion</h2>
          {pending.length === 0 && <p className="muted">Aucune demande en attente.</p>}
          <ul>
            {pending.map((request) => (
              <li key={request.id} className="row">
                <strong>{request.playerName}</strong>
                <span className="muted">expire le {dateOf(request.expiresAt)}</span>
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      client.requests[':requestId'].accept.$post({
                        param: { requestId: request.id },
                      }),
                    )
                  }
                >
                  Accepter
                </button>
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    run(() =>
                      client.requests[':requestId'].refuse.$post({
                        param: { requestId: request.id },
                      }),
                    )
                  }
                >
                  Refuser
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** Joueur sans clan : fonder un clan, ou demander à en rejoindre un. */
function NoClan({ clans, mine, run }: { clans: ClanSummary[]; mine: JoinRequestView[]; run: Run }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const requested = new Set(mine.map((request) => request.clanId))

  function found(event: FormEvent) {
    event.preventDefault()
    run(() => client.clans.$post({ json: { name, tag } }))
  }

  return (
    <>
      <section className="panel" aria-label="Fonder un clan">
        <h2>Fonder un clan</h2>
        <form className="row" onSubmit={found}>
          <input
            aria-label="Nom du clan"
            placeholder="Nom du clan"
            value={name}
            maxLength={NAME_LENGTH.max}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            aria-label="Tag"
            placeholder="Tag"
            value={tag}
            maxLength={4}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
          />
          <button type="submit">Fonder</button>
        </form>
      </section>

      <section className="panel" aria-label="Rejoindre un clan">
        <h2>Rejoindre un clan</h2>
        {clans.length === 0 && <p className="muted">Aucun clan pour le moment.</p>}
        <ul>
          {clans.map((summary) => (
            <li key={summary.id} className="row">
              <strong>
                {summary.name} [{summary.tag}]
              </strong>
              <span className="muted">
                {summary.members}/{MAX_MEMBERS} membres
              </span>
              {requested.has(summary.id) ? (
                <span className="muted">Demande envoyée</span>
              ) : (
                <button
                  type="button"
                  disabled={summary.members >= MAX_MEMBERS}
                  onClick={() =>
                    run(() =>
                      client.clans[':clanId'].requests.$post({ param: { clanId: summary.id } }),
                    )
                  }
                >
                  Demander à rejoindre
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
