CREATE TABLE "searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid NOT NULL,
	"selected_topic_ids" jsonb NOT NULL,
	"minimum_matching_users" integer NOT NULL,
	"duration_minutes" integer,
	"range_start" timestamp with time zone NOT NULL,
	"range_end" timestamp with time zone NOT NULL,
	"organizer_timezone" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot_reference" text,
	CONSTRAINT "searches_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "searches_organizer_id_idx" ON "searches" USING btree ("organizer_id");
--> statement-breakpoint
CREATE INDEX "searches_generated_at_idx" ON "searches" USING btree ("generated_at");
