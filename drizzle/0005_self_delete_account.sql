ALTER TABLE "invites" DROP CONSTRAINT "invites_invited_by_admin_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "invites" ALTER COLUMN "invited_by_admin_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_admin_id_users_id_fk" FOREIGN KEY ("invited_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
