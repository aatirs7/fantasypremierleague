ALTER TABLE "users" ADD COLUMN "pin_reset_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pin_reset_expires_at" timestamp with time zone;