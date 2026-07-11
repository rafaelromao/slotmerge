CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by_admin_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "invites_invited_by_admin_id_idx" ON "invites" USING btree ("invited_by_admin_id");
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_admin_id_users_id_fk" FOREIGN KEY ("invited_by_admin_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
