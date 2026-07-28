CREATE TABLE "audit_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_records_actor_id_idx" ON "audit_records" USING btree ("actor_id");
--> statement-breakpoint
CREATE INDEX "audit_records_target_id_idx" ON "audit_records" USING btree ("target_id");
--> statement-breakpoint
CREATE INDEX "audit_records_action_idx" ON "audit_records" USING btree ("action");
