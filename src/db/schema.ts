import {
  boolean,
  integer,
  pgTable,
  uniqueIndex,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export type UserRole = "user" | "organizer" | "admin";
export type UserStatus = "active" | "suspended";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  role: text("role").$type<UserRole>().notNull().default("user"),
  status: text("status").$type<UserStatus>().notNull().default("active"),
  profileTimezone: text("profile_timezone"),
  bufferMinutes: integer("buffer_minutes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  csrfToken: text("csrf_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const localSmokeJobs = pgTable("local_smoke_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  marker: text("marker").notNull(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const emailEvents = pgTable("email_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipient: text("recipient").notNull(),
  type: text("type").notNull(),
  payloadReference: text("payload_reference").notNull(),
  status: text("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  providerMessageId: text("provider_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const emailEventAttempts = pgTable(
  "email_event_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailEventId: uuid("email_event_id")
      .notNull()
      .references(() => emailEvents.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: text("status").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    providerMessageId: text("provider_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailEventAttemptUnique: uniqueIndex(
      "email_event_attempts_email_event_id_attempt_number_idx",
    ).on(table.emailEventId, table.attemptNumber),
  }),
);

export const emailEventsRelations = relations(emailEvents, ({ many }) => ({
  attempts: many(emailEventAttempts),
}));

export const emailEventAttemptsRelations = relations(
  emailEventAttempts,
  ({ one }) => ({
    emailEvent: one(emailEvents, {
      fields: [emailEventAttempts.emailEventId],
      references: [emailEvents.id],
    }),
  }),
);
