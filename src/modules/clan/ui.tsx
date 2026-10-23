'use client'
import { hc } from 'hono/client'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useChannel } from '@/platform/realtime/use-channel'
import { Entity } from '@/ui/entity'
import type { ClanApi } from './api'
import {
  type ChatError,
  type ClanMessage,
  type ClanSummary,
  type ClanView,
  clanChannel,
  clanStateChannel,
  type DonationView,
  type JoinRequestView,
  MAX_MEMBERS,
  MESSAGE_MAX_LENGTH,
  NAME_LENGTH,
  type Role,
  type TreasuryError,
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
function errorText(error: TreasuryError | ChatError | { code: 'INVALID_INPUT' }): string {
  switch (error.code) {
    case 'INVALID_AMOUNT':
      return `Le montant doit être un nombre entier d'or, entre 1 et ${error.max}.`
    case 'INSUFFICIENT_TREASURY':
      return `Le trésor ne contient que ${error.available} or.`
    case 'EMPTY_MESSAGE':
      return 'Le message est vide.'
    case 'MESSAGE_TOO_LONG':
      return `Le message dépasse ${error.max} caractères.`
    case 'TOO_MANY_MESSAGES':
      return `Trop de messages : patientez ${Math.ceil(error.retryAfterMs / 1000)} secondes.`
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
    setError('error' in body ? errorText(body.error as TreasuryError) : null)
    await refresh()
  }

  if (!loaded) return <p className="muted">Chargement...</p>

  // TEMPS RÉEL : l'état du clan du joueur est suivi, ou à défaut celui des clans qu'il a
  // demandé à rejoindre, pour qu'il voie aussitôt l'acceptation ou le refus.
  const watched = clan ? [clan.id] : mine.map((request) => request.clanId)

  return (
    <>
      {watched.map((clanId) => (
        <ClanWatcher key={clanId} clanId={clanId} onChange={refresh} />
      ))}
      <h1>
        <Entity kind="clan" /> {clan ? `${clan.name} [${clan.tag}]` : 'Clans'}
      </h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {clan ? (
        <>
          <ClanPanel clan={clan} pending={pending} run={run} />
          <Treasury clan={clan} run={run} />
          <ClanChat clanId={clan.id} />
        </>
      ) : (
        <NoClan clans={clans} mine={mine} run={run} />
      )}
    </>
  )
}

type Run = (command: () => Promise<Response>) => Promise<void>

/** Message affiché au donateur pour chaque état de son don. */
const DONATION_LABELS: Record<DonationView['status'], string> = {
  pending: 'Don en cours de prélèvement dans votre village...',
  credited: 'Don crédité au trésor du clan.',
  refused: "Don refusé : votre village n'a pas assez d'or.",
  refunded: 'Le clan a été dissous : votre or vous a été rendu.',
}

/** Trésor du clan : les dons de tous les membres, et les distributions du chef. */
function Treasury({ clan, run }: { clan: ClanView; run: Run }) {
  const [gift, setGift] = useState('')
  const [share, setShare] = useState('')
  const [target, setTarget] = useState('')
  const [donation, setDonation] = useState<DonationView | null>(null)
  const others = clan.members.filter((member) => member.role !== 'leader')

  function donate(event: FormEvent) {
    event.preventDefault()
    run(async () => {
      const res = await client.treasury.donations.$post({ json: { amount: Number(gift) } })
      // La réponse est lue ici pour l'état du don, et de nouveau par run pour l'erreur éventuelle.
      const body = (await res.clone().json()) as { donation?: DonationView }
      setDonation(body.donation ?? null)
      if (body.donation) setGift('')
      return res
    })
  }

  function distribute(event: FormEvent) {
    event.preventDefault()
    const playerId = target || others[0]?.playerId || ''
    run(() => client.treasury.distributions.$post({ json: { playerId, amount: Number(share) } }))
  }

  return (
    <section className="panel" aria-label="Trésor du clan">
      <h2>
        Trésor : {clan.treasury} <Entity kind="gold" />
      </h2>
      <form className="row" onSubmit={donate}>
        <input
          aria-label="Or à donner"
          type="number"
          min={1}
          placeholder="Or à donner"
          value={gift}
          onChange={(e) => setGift(e.target.value)}
        />
        <button type="submit">Donner</button>
      </form>
      {donation && <p className="muted">{DONATION_LABELS[donation.status]}</p>}
      {clan.myRole === 'leader' && others.length > 0 && (
        <form className="row" onSubmit={distribute}>
          <select
            aria-label="Membre"
            value={target || others[0].playerId}
            onChange={(e) => setTarget(e.target.value)}
          >
            {others.map((member) => (
              <option key={member.playerId} value={member.playerId}>
                {member.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Or à distribuer"
            type="number"
            min={1}
            placeholder="Or à distribuer"
            value={share}
            onChange={(e) => setShare(e.target.value)}
          />
          <button type="submit">Distribuer</button>
        </form>
      )}
    </section>
  )
}

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

/** Libellé affiché pour chaque état de la connexion temps réel. */
const STATUS_LABELS = {
  connecting: 'Connexion...',
  open: 'Temps réel connecté',
  reconnecting: 'Reconnexion...',
} as const

/** Ajoute des messages à la liste, sans doublon, dans l'ordre de leurs identifiants. */
function merge(current: ClanMessage[], added: ClanMessage[]): ClanMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of added) byId.set(message.id, message)
  return [...byId.values()].sort((a, b) => a.id - b.id)
}

/** Heure d'un message, au format local. */
const timeOf = (at: number) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Abonnement au canal de l'état d'un clan : chaque changement de ses membres, de ses demandes
 * ou de son trésor fait relire l'état du clan. Le composant n'affiche rien.
 */
function ClanWatcher({ clanId, onChange }: { clanId: string; onChange: () => void }) {
  const status = useChannel(clanStateChannel(clanId), onChange)

  // Après une reconnexion, l'état est relu : un changement a pu avoir lieu entre-temps.
  useEffect(() => {
    if (status === 'open') onChange()
  }, [status, onChange])

  return null
}

/** Chat du clan, réservé à ses membres, reçu en temps réel. */
function ClanChat({ clanId }: { clanId: string }) {
  const [messages, setMessages] = useState<ClanMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  // REQUÊTE : les derniers messages du clan.
  const refresh = useCallback(async () => {
    const res = await client.messages.$get()
    const body = await res.json()
    if ('messages' in body) setMessages((current) => merge(current, body.messages))
  }, [])

  // TEMPS RÉEL : chaque nouveau message du clan est reçu avec son contenu.
  const status = useChannel(clanChannel(clanId), (event) => {
    setMessages((current) => merge(current, [event.data as unknown as ClanMessage]))
  })

  // À chaque ouverture du canal, y compris après une reconnexion, l'historique est relu.
  useEffect(() => {
    if (status === 'open') refresh()
  }, [status, refresh])

  // COMMANDE : publication d'un message.
  async function send(event: FormEvent) {
    event.preventDefault()
    const res = await client.messages.$post({ json: { body: draft } })
    const body = await res.json()
    if ('error' in body) {
      setError(errorText(body.error as ChatError))
    } else {
      setError(null)
      setDraft('')
      setMessages((current) => merge(current, [body.message]))
    }
  }

  return (
    <section className="panel" aria-label="Chat du clan">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>Chat du clan</h2>
        <span className="status" data-status={status}>
          {STATUS_LABELS[status]}
        </span>
      </div>
      {messages.length === 0 && <p className="muted">Aucun message pour le moment.</p>}
      <ul className="messages">
        {messages.map((message) => (
          <li key={message.id}>
            <span className="muted">{timeOf(message.postedAt)}</span>{' '}
            <strong>{message.authorName}</strong> {message.body}
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={send}>
        <input
          aria-label="Votre message"
          value={draft}
          maxLength={MESSAGE_MAX_LENGTH * 2}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Votre message"
          style={{ flex: 1 }}
        />
        <button type="submit">Envoyer</button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
