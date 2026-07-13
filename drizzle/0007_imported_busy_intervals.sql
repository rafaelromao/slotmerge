CREATE TABLE "imported_busy_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"provider_calendar_id" text NOT NULL,
	"provider_event_reference" text,
	"status" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imported_busy_intervals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "imported_busy_intervals_connection_id_calendar_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "imported_busy_intervals_user_id_idx" ON "imported_busy_intervals" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "imported_busy_intervals_connection_id_idx" ON "imported_busy_intervals" USING btree ("connection_id");
--> statement-breakpoint
CREATE INDEX "imported_busy_intervals_user_id_start_at_end_at_idx" ON "imported_busy_intervals" USING btree ("user_id", "start_at", "end_at");
