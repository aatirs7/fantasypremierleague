CREATE TABLE "draft_queues" (
	"league_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"fpl_id" integer NOT NULL,
	"rank" integer NOT NULL,
	CONSTRAINT "draft_queues_league_id_user_id_fpl_id_pk" PRIMARY KEY("league_id","user_id","fpl_id")
);
