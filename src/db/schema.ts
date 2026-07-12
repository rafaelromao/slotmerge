import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export type UserRole = "user" | "organizer" | "admin";
export type UserStatus = "active" | "suspended";
export type InviteRole = UserRole;
export type InviteStatus = "pending" | "accepted" | "revoked";
export type CalendarConnectionStatus = "pending" | "connected" | "disconnected";
export type CalendarProvider = "google" | "microsoft";
export type TopicStatus = "pending" | "active" | "retired";
export type TopicProposalStatus = "pending" | "approved" | "rejected";
export type TopicAssociationStatus =
  "active" | "pending-retired" | "historical";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  shortBio: text("short_bio"),
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
  calendarConnections: many(calendarConnections),
  topicProposals: many(topicProposals),
  userTopics: many(userTopics),
  availabilityWindows: many(availabilityWindows),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").$type<CalendarProvider>().notNull(),
  providerAccountKey: text("provider_account_key"),
  accountIdentifier: text("account_identifier"),
  scopes: text("scopes"),
  status: text("status")
    .$type<CalendarConnectionStatus>()
    .notNull()
    .default("pending"),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  accessTokenEncrypted: text("access_token_encrypted"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  lastErrorCode: text("last_error_code"),
  lastErrorMessage: text("last_error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const calendarConnectionsRelations = relations(
  calendarConnections,
  ({ one }) => ({
    user: one(users, {
      fields: [calendarConnections.userId],
      references: [users.id],
    }),
  }),
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    role: text("role").$type<InviteRole>().notNull().default("user"),
    status: text("status").$type<InviteStatus>().notNull().default("pending"),
    invitedByAdminId: uuid("invited_by_admin_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    invitedByAdminIdIdx: index("invites_invited_by_admin_id_idx").on(
      table.invitedByAdminId,
    ),
  }),
);

export const invitesRelations = relations(invites, ({ one }) => ({
  invitedByAdmin: one(users, {
    fields: [invites.invitedByAdminId],
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

export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  status: text("status").$type<TopicStatus>().notNull().default("pending"),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const topicProposals = pgTable("topic_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposedByUserId: uuid("proposed_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  candidateName: text("candidate_name").notNull(),
  status: text("status")
    .$type<TopicProposalStatus>()
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const userTopics = pgTable(
  "user_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    status: text("status")
      .$type<TopicAssociationStatus>()
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userTopicsUserIdIdx: index("user_topics_user_id_idx").on(table.userId),
    userTopicsTopicIdIdx: index("user_topics_topic_id_idx").on(table.topicId),
    userTopicsUserTopicUnique: uniqueIndex(
      "user_topics_user_topic_unique_idx",
    ).on(table.userId, table.topicId),
  }),
);

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

export const topicsRelations = relations(topics, ({ many }) => ({
  userTopics: many(userTopics),
}));

export const topicProposalsRelations = relations(topicProposals, ({ one }) => ({
  proposedByUser: one(users, {
    fields: [topicProposals.proposedByUserId],
    references: [users.id],
  }),
}));

export const userTopicsRelations = relations(userTopics, ({ one }) => ({
  user: one(users, {
    fields: [userTopics.userId],
    references: [users.id],
  }),
  topic: one(topics, {
    fields: [userTopics.topicId],
    references: [topics.id],
  }),
}));

export const discoverabilityConsents = pgTable("discoverability_consents", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  grantedAt: timestamp("granted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const availabilityWindows = pgTable(
  "availability_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    profileTimezone: text("profile_timezone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("availability_windows_user_id_idx").on(table.userId),
    userIdDayStartUnique: uniqueIndex(
      "availability_windows_user_id_day_of_week_start_time_unique_idx",
    ).on(table.userId, table.dayOfWeek, table.startTime),
  }),
);

export const availabilityWindowsRelations = relations(
  availabilityWindows,
  ({ one }) => ({
    user: one(users, {
      fields: [availabilityWindows.userId],
      references: [users.id],
    }),
  }),
);

export type WeeklyAvailabilityWindow = typeof availabilityWindows.$inferSelect;
export type CreateWeeklyAvailabilityWindow = Pick<
  WeeklyAvailabilityWindow,
  "dayOfWeek" | "startTime" | "endTime"
>;
export type NewWeeklyAvailabilityWindow = Omit<
  typeof availabilityWindows.$inferInsert,
  "id" | "createdAt" | "updatedAt"
>;
export type WeeklyAvailabilityWindowUpdate = Partial<
  Pick<CreateWeeklyAvailabilityWindow, "dayOfWeek" | "startTime" | "endTime">
>;

export const searches = pgTable(
  "searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    selectedTopicIds: jsonb("selected_topic_ids").$type<string[]>().notNull(),
    minimumMatchingUsers: integer("minimum_matching_users").notNull(),
    durationMinutes: integer("duration_minutes"),
    rangeStart: timestamp("range_start", { withTimezone: true }).notNull(),
    rangeEnd: timestamp("range_end", { withTimezone: true }).notNull(),
    organizerTimezone: text("organizer_timezone").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    snapshotReference: text("snapshot_reference"),
  },
  (table) => ({
    searchesOrganizerIdIdx: index("searches_organizer_id_idx").on(
      table.organizerId,
    ),
    searchesGeneratedAtIdx: index("searches_generated_at_idx").on(
      table.generatedAt,
    ),
  }),
);
