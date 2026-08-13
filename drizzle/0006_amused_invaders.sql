CREATE TABLE "chips" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"chip" text NOT NULL,
	"gw" integer NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chips_league_id_user_id_chip_pk" PRIMARY KEY("league_id","user_id","chip")
);
--> statement-breakpoint
CREATE TABLE "gw_awards" (
	"league_id" uuid NOT NULL,
	"gw" integer NOT NULL,
	"kind" text NOT NULL,
	"user_id" uuid NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"detail" text,
	CONSTRAINT "gw_awards_league_id_gw_kind_pk" PRIMARY KEY("league_id","gw","kind")
);
--> statement-breakpoint
CREATE TABLE "h2h_records" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"points_for" integer DEFAULT 0 NOT NULL,
	"points_against" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "h2h_records_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "matchups" (
	"league_id" uuid NOT NULL,
	"gw" integer NOT NULL,
	"slot" integer DEFAULT 0 NOT NULL,
	"home_user_id" uuid NOT NULL,
	"away_user_id" uuid,
	"home_points" integer,
	"away_points" integer,
	"round" text DEFAULT 'regular' NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "matchups_league_id_gw_slot_pk" PRIMARY KEY("league_id","gw","slot")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
