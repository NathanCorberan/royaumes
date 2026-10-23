CREATE SCHEMA "clan";
--> statement-breakpoint
CREATE TABLE "clan"."clans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"treasury" integer DEFAULT 0 NOT NULL,
	"founded_at" bigint NOT NULL,
	CONSTRAINT "clans_name_unique" UNIQUE("name"),
	CONSTRAINT "clans_tag_unique" UNIQUE("tag")
);
--> statement-breakpoint
CREATE TABLE "clan"."distributions" (
	"id" text PRIMARY KEY NOT NULL,
	"clan_id" text NOT NULL,
	"player_id" text NOT NULL,
	"amount" integer NOT NULL,
	"distributed_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan"."donations" (
	"id" text PRIMARY KEY NOT NULL,
	"clan_id" text NOT NULL,
	"player_id" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"donated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan"."members" (
	"player_id" text PRIMARY KEY NOT NULL,
	"clan_id" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan"."messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"clan_id" text NOT NULL,
	"author_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"posted_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan"."requests" (
	"id" text PRIMARY KEY NOT NULL,
	"clan_id" text NOT NULL,
	"player_id" text NOT NULL,
	"player_name" text NOT NULL,
	"requested_at" bigint NOT NULL,
	CONSTRAINT "requests_clan_player_unique" UNIQUE("clan_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "clan"."members" ADD CONSTRAINT "members_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "clan"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan"."messages" ADD CONSTRAINT "messages_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "clan"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan"."requests" ADD CONSTRAINT "requests_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "clan"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "distributions_player_idx" ON "clan"."distributions" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "donations_player_idx" ON "clan"."donations" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "members_clan_idx" ON "clan"."members" USING btree ("clan_id");--> statement-breakpoint
CREATE INDEX "messages_clan_idx" ON "clan"."messages" USING btree ("clan_id","id");--> statement-breakpoint
CREATE INDEX "messages_author_idx" ON "clan"."messages" USING btree ("author_id","posted_at");--> statement-breakpoint
CREATE INDEX "messages_posted_at_idx" ON "clan"."messages" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "requests_player_idx" ON "clan"."requests" USING btree ("player_id");