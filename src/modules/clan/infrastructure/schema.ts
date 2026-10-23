import { bigint, bigserial, index, integer, pgSchema, text, unique } from 'drizzle-orm/pg-core'

/**
 * Schéma PostgreSQL du module Clan. Comme la Taverne, le Clan n'enregistre aucun événement :
 * ses tables sont sa seule source de vérité, et ne contiennent que l'état courant des clans.
 */
export const clan = pgSchema('clan')

/** Clans, avec l'or de leur trésor. Le nom et le tag sont uniques (règle 1). */
export const clans = clan.table('clans', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  tag: text('tag').notNull().unique(),
  treasury: integer('treasury').notNull().default(0),
  foundedAt: bigint('founded_at', { mode: 'number' }).notNull(),
})

/**
 * Membres des clans. La clé primaire est le joueur : un joueur appartient à au plus un clan
 * (règle 2), ce que la base garantit même en cas de requêtes simultanées.
 */
export const members = clan.table(
  'members',
  {
    playerId: text('player_id').primaryKey(),
    clanId: text('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    /** Nom du joueur à son arrivée ; effacé avec son appartenance. */
    name: text('name').notNull(),
    /** Rôle : leader, officer ou member. */
    role: text('role').notNull(),
    joinedAt: bigint('joined_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('members_clan_idx').on(t.clanId)],
)

/** Demandes d'adhésion en attente ; une demande acceptée, refusée ou expirée est supprimée. */
export const requests = clan.table(
  'requests',
  {
    id: text('id').primaryKey(),
    clanId: text('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    playerName: text('player_name').notNull(),
    requestedAt: bigint('requested_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    unique('requests_clan_player_unique').on(t.clanId, t.playerId),
    index('requests_player_idx').on(t.playerId),
  ],
)

/** Messages du chat des clans, supprimés à l'expiration de leur durée de conservation. */
export const messages = clan.table(
  'messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    clanId: text('clan_id')
      .notNull()
      .references(() => clans.id, { onDelete: 'cascade' }),
    authorId: text('author_id').notNull(),
    /** Nom de l'auteur au moment de la publication ; effacé avec les messages de l'auteur. */
    authorName: text('author_name').notNull(),
    body: text('body').notNull(),
    postedAt: bigint('posted_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    // Le chat d'un clan est lu dans l'ordre de ses messages.
    index('messages_clan_idx').on(t.clanId, t.id),
    // La limitation compte les messages récents d'un auteur ; l'effacement les supprime tous.
    index('messages_author_idx').on(t.authorId, t.postedAt),
    // La durée de conservation supprime les messages les plus anciens.
    index('messages_posted_at_idx').on(t.postedAt),
  ],
)

/**
 * Dons au trésor, et avancement de leur saga avec le Village. Un don ne référence pas son clan
 * par une clé étrangère : il survit à la dissolution du clan, le temps d'être remboursé.
 * DETTE TECHNIQUE (docs/qualite/dette-technique.md, DT-014) : les dons et les distributions
 * n'ont pas de durée de conservation ; ils ne sont supprimés qu'avec le compte du joueur.
 */
export const donations = clan.table(
  'donations',
  {
    /** Identifiant du don, qui sert d'identifiant du mouvement auprès du Village. */
    id: text('id').primaryKey(),
    clanId: text('clan_id').notNull(),
    playerId: text('player_id').notNull(),
    amount: integer('amount').notNull(),
    /** État : pending, credited, refused ou refunded. */
    status: text('status').notNull(),
    donatedAt: bigint('donated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('donations_player_idx').on(t.playerId)],
)

/** Distributions de l'or du trésor par le chef. */
export const distributions = clan.table(
  'distributions',
  {
    /** Identifiant de la distribution, qui sert d'identifiant du mouvement auprès du Village. */
    id: text('id').primaryKey(),
    clanId: text('clan_id').notNull(),
    /** Membre qui a reçu l'or. */
    playerId: text('player_id').notNull(),
    amount: integer('amount').notNull(),
    distributedAt: bigint('distributed_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('distributions_player_idx').on(t.playerId)],
)
