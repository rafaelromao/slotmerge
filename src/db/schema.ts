import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const localSmokeJobs = pgTable("local_smoke_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  marker: text("marker").notNull(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
