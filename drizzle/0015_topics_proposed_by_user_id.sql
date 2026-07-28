ALTER TABLE "topics" ADD COLUMN "proposed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
