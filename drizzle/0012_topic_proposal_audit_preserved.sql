ALTER TABLE "topic_proposals" DROP CONSTRAINT "topic_proposals_proposed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "topic_proposals" ALTER COLUMN "proposed_by_user_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "topic_proposals" ADD CONSTRAINT "topic_proposals_proposed_by_user_id_users_id_fk" FOREIGN KEY ("proposed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;