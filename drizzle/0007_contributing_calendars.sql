ALTER TABLE "calendar_connections" ADD COLUMN "contributing_calendar_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
