CREATE TABLE "draft_picks" (
	"league_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"pick_number" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"fpl_id" integer NOT NULL,
	"auto_picked" boolean DEFAULT false NOT NULL,
	"picked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_picks_league_id_pick_number_pk" PRIMARY KEY("league_id","pick_number")
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"fpl_fixture_id" integer PRIMARY KEY NOT NULL,
	"gw" integer,
	"kickoff" timestamp with time zone,
	"home_club" integer NOT NULL,
	"away_club" integer NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"started" boolean DEFAULT false NOT NULL,
	"finished" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fpl_players" (
	"fpl_id" integer PRIMARY KEY NOT NULL,
	"web_name" text NOT NULL,
	"full_name" text NOT NULL,
	"club_id" integer NOT NULL,
	"club_name" text NOT NULL,
	"club_short" text NOT NULL,
	"position" text NOT NULL,
	"price" numeric(4, 1),
	"draft_rank" integer,
	"status" text DEFAULT 'a' NOT NULL,
	"news" text,
	"chance_next" integer,
	"total_points" integer DEFAULT 0 NOT NULL,
	"form" numeric(4, 2),
	"ppg" numeric(4, 2),
	"ownership" numeric(5, 2),
	"ict_index" numeric(6, 2),
	"ict_rank" integer,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"clean_sheets" integer DEFAULT 0 NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"bonus" integer DEFAULT 0 NOT NULL,
	"yellow_cards" integer DEFAULT 0 NOT NULL,
	"red_cards" integer DEFAULT 0 NOT NULL,
	"xg" numeric(6, 2),
	"xa" numeric(6, 2),
	"set_piece_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gameweeks" (
	"gw" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"finished" boolean DEFAULT false NOT NULL,
	"data_checked" boolean DEFAULT false NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"is_next" boolean DEFAULT false NOT NULL,
	"avg_score" integer,
	"top_score" integer,
	"finalized_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gw_player_points" (
	"gw" integer NOT NULL,
	"fpl_id" integer NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"clean_sheet" boolean DEFAULT false NOT NULL,
	"goals_conceded" integer DEFAULT 0 NOT NULL,
	"own_goals" integer DEFAULT 0 NOT NULL,
	"pens_saved" integer DEFAULT 0 NOT NULL,
	"pens_missed" integer DEFAULT 0 NOT NULL,
	"yellow" integer DEFAULT 0 NOT NULL,
	"red" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"bonus" integer DEFAULT 0 NOT NULL,
	"total_points" integer NOT NULL,
	CONSTRAINT "gw_player_points_gw_fpl_id_pk" PRIMARY KEY("gw","fpl_id")
);
--> statement-breakpoint
CREATE TABLE "gw_scores" (
	"squad_id" uuid NOT NULL,
	"gw" integer NOT NULL,
	"raw_points" integer DEFAULT 0 NOT NULL,
	"captain_bonus" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"autosubs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final" boolean DEFAULT false NOT NULL,
	CONSTRAINT "gw_scores_squad_id_gw_pk" PRIMARY KEY("squad_id","gw")
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_order" integer,
	"last_seen_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "league_members_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"join_code" char(6) NOT NULL,
	"owner_id" uuid NOT NULL,
	"draft_time" timestamp with time zone,
	"draft_status" text DEFAULT 'pending' NOT NULL,
	"veto_enabled" boolean DEFAULT false NOT NULL,
	"season" text DEFAULT '2026-27' NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"current_pick" integer,
	"current_pick_deadline" timestamp with time zone,
	"bot_speed_ms" integer,
	"bot_variance" boolean DEFAULT false NOT NULL,
	"state_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "lineups" (
	"squad_id" uuid NOT NULL,
	"gw" integer NOT NULL,
	"picks" jsonb NOT NULL,
	"auto_set" boolean DEFAULT true NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lineups_squad_id_gw_pk" PRIMARY KEY("squad_id","gw")
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_scores" (
	"squad_id" uuid PRIMARY KEY NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"gws_played" integer DEFAULT 0 NOT NULL,
	"gw_wins" integer DEFAULT 0 NOT NULL,
	"squad_goals" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "squad_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"squad_id" uuid NOT NULL,
	"fpl_id" integer NOT NULL,
	"acquired_via" text NOT NULL,
	"acquired_gw" integer,
	"dropped_gw" integer
);
--> statement-breakpoint
CREATE TABLE "squads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "standing_snapshots" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"rank" integer,
	"captured_key" text NOT NULL,
	CONSTRAINT "standing_snapshots_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "sync_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"proposer_id" uuid NOT NULL,
	"receiver_id" uuid NOT NULL,
	"offer_fpl_ids" integer[] NOT NULL,
	"request_fpl_ids" integer[] NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"executes_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"username_lower" text NOT NULL,
	"pin_hash" text NOT NULL,
	"is_bot" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waiver_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"gw" integer NOT NULL,
	"add_fpl_id" integer NOT NULL,
	"drop_fpl_id" integer NOT NULL,
	"user_rank" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "waiver_locks" (
	"league_id" uuid NOT NULL,
	"fpl_id" integer NOT NULL,
	"until_gw" integer NOT NULL,
	CONSTRAINT "waiver_locks_league_id_fpl_id_pk" PRIMARY KEY("league_id","fpl_id")
);
--> statement-breakpoint
CREATE TABLE "waiver_priority" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"priority" integer NOT NULL,
	CONSTRAINT "waiver_priority_league_id_user_id_pk" PRIMARY KEY("league_id","user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "squads_league_user_unique" ON "squads" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_lower_unique" ON "users" USING btree ("username_lower");--> statement-breakpoint
CREATE UNIQUE INDEX "one_owner_per_league" ON "squad_players" ("league_id","fpl_id") WHERE "dropped_gw" IS NULL;
