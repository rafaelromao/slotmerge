import {
  users,
  topics,
  topicProposals,
  availabilityWindows,
  availabilityOverrides,
  calendarConnections,
  importedBusyIntervals,
  userTopics,
  sessions,
  discoverabilityConsents,
} from "../../src/db/schema";
import type { AppDb } from "../../src/db/client";

export const FIXTURE_DATE = "2026-07-12T12:00:00.000Z";

export const USER_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    email: "user@example.com",
    displayName: "Alice User",
    role: "user" as const,
    status: "active" as const,
    profileTimezone: "America/New_York",
    bufferMinutes: 5,
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    email: "organizer@example.com",
    displayName: "Bob Organizer",
    role: "organizer" as const,
    status: "active" as const,
    profileTimezone: "America/Los_Angeles",
    bufferMinutes: 10,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    email: "admin@example.com",
    displayName: "Carol Admin",
    role: "admin" as const,
    status: "active" as const,
    profileTimezone: "Europe/London",
    bufferMinutes: 0,
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    email: "dana@example.com",
    displayName: "Dana Discoverable",
    role: "user" as const,
    status: "active" as const,
    profileTimezone: "UTC",
    bufferMinutes: 0,
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    email: "eli@example.com",
    displayName: "Eli Discoverable",
    role: "user" as const,
    status: "active" as const,
    profileTimezone: "UTC",
    bufferMinutes: 0,
  },
];

export const TOPIC_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000010",
    name: "Product strategy",
    status: "active" as const,
    proposedByUserId: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000011",
    name: "AI engineering",
    status: "active" as const,
    proposedByUserId: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000012",
    name: "Design systems",
    status: "pending" as const,
    proposedByUserId: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000013",
    name: "Legacy codebase",
    status: "retired" as const,
    proposedByUserId: null,
  },
  {
    id: "00000000-0000-0000-0000-000000000014",
    name: "Identity and access",
    status: "active" as const,
    proposedByUserId: USER_FIXTURES[2].id,
  },
];

export const TOPIC_PROPOSAL_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000060",
    proposedByUserId: USER_FIXTURES[2].id,
    candidateName: "Engineering management",
    status: "pending" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000061",
    proposedByUserId: USER_FIXTURES[0].id,
    candidateName: "Distributed tracing",
    status: "pending" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000062",
    proposedByUserId: USER_FIXTURES[2].id,
    candidateName: "Identity and access",
    status: "approved" as const,
  },
];

export const AVAILABILITY_WINDOW_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000020",
    userId: USER_FIXTURES[0].id,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    profileTimezone: "America/New_York",
  },
  {
    id: "00000000-0000-0000-0000-000000000021",
    userId: USER_FIXTURES[0].id,
    dayOfWeek: 2,
    startTime: "09:00",
    endTime: "17:00",
    profileTimezone: "America/New_York",
  },
  {
    id: "00000000-0000-0000-0000-000000000022",
    userId: USER_FIXTURES[1].id,
    dayOfWeek: 1,
    startTime: "08:00",
    endTime: "16:00",
    profileTimezone: "America/Los_Angeles",
  },
  {
    id: "00000000-0000-0000-0000-000000000023",
    userId: USER_FIXTURES[3].id,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    profileTimezone: "UTC",
  },
  {
    id: "00000000-0000-0000-0000-000000000024",
    userId: USER_FIXTURES[4].id,
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    profileTimezone: "UTC",
  },
];

export const OVERRIDE_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000030",
    userId: USER_FIXTURES[0].id,
    date: "2026-07-15",
    startTime: "12:00",
    endTime: "13:00",
    type: "add" as const,
    profileTimezone: "America/New_York",
  },
  {
    id: "00000000-0000-0000-0000-000000000031",
    userId: USER_FIXTURES[1].id,
    date: "2026-07-16",
    startTime: "09:00",
    endTime: "12:00",
    type: "block" as const,
    profileTimezone: "America/Los_Angeles",
  },
];

export const CALENDAR_CONNECTION_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000030",
    userId: USER_FIXTURES[0].id,
    provider: "google" as const,
    providerAccountKey: "google:user-1",
    accountIdentifier: "user@gmail.com",
    scopes: "https://www.googleapis.com/auth/calendar.freebusy",
    status: "connected" as const,
    accessTokenExpiresAt: new Date("2026-07-13T12:00:00.000Z"),
    contributingCalendarIds: [] as string[],
  },
  {
    id: "00000000-0000-0000-0000-000000000031",
    userId: USER_FIXTURES[1].id,
    provider: "microsoft" as const,
    providerAccountKey: "microsoft:user-2",
    accountIdentifier: "user@outlook.com",
    scopes: "Calendars.Read",
    status: "connected" as const,
    accessTokenExpiresAt: new Date("2026-07-13T12:00:00.000Z"),
    contributingCalendarIds: [] as string[],
  },
];

export const IMPORTED_BUSY_INTERVAL_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000040",
    userId: USER_FIXTURES[0].id,
    connectionId: CALENDAR_CONNECTION_FIXTURES[0].id,
    providerCalendarId: "calendar-1",
    providerEventReference: "event-1",
    status: "busy" as const,
    startAt: new Date("2026-07-13T10:00:00.000Z"),
    endAt: new Date("2026-07-13T11:00:00.000Z"),
  },
  {
    id: "00000000-0000-0000-0000-000000000041",
    userId: USER_FIXTURES[0].id,
    connectionId: CALENDAR_CONNECTION_FIXTURES[0].id,
    providerCalendarId: "calendar-1",
    providerEventReference: "event-2",
    status: "out-of-office" as const,
    startAt: new Date("2026-07-14T14:00:00.000Z"),
    endAt: new Date("2026-07-14T15:00:00.000Z"),
  },
];

export const USER_TOPIC_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000050",
    userId: USER_FIXTURES[0].id,
    topicId: TOPIC_FIXTURES[0].id,
    status: "active" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000051",
    userId: USER_FIXTURES[0].id,
    topicId: TOPIC_FIXTURES[1].id,
    status: "active" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000052",
    userId: USER_FIXTURES[1].id,
    topicId: TOPIC_FIXTURES[0].id,
    status: "active" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000053",
    userId: USER_FIXTURES[1].id,
    topicId: TOPIC_FIXTURES[1].id,
    status: "active" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000054",
    userId: USER_FIXTURES[3].id,
    topicId: TOPIC_FIXTURES[0].id,
    status: "active" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000055",
    userId: USER_FIXTURES[3].id,
    topicId: TOPIC_FIXTURES[1].id,
    status: "active" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000056",
    userId: USER_FIXTURES[4].id,
    topicId: TOPIC_FIXTURES[0].id,
    status: "active" as const,
  },
  {
    id: "00000000-0000-0000-0000-000000000057",
    userId: USER_FIXTURES[4].id,
    topicId: TOPIC_FIXTURES[1].id,
    status: "active" as const,
  },
];

export const DISCOVERABILITY_CONSENT_FIXTURES = [
  {
    userId: USER_FIXTURES[3].id,
    grantedAt: new Date(FIXTURE_DATE),
  },
  {
    userId: USER_FIXTURES[4].id,
    grantedAt: new Date(FIXTURE_DATE),
  },
];

export const SESSION_FIXTURES = [
  {
    id: "00000000-0000-0000-0000-000000000060",
    userId: USER_FIXTURES[0].id,
    csrfToken: "csrf-token-1",
    expiresAt: new Date("2026-07-19T12:00:00.000Z"),
  },
];

export async function seedAll(db: AppDb): Promise<void> {
  const now = new Date(FIXTURE_DATE);

  await db.delete(discoverabilityConsents);

  for (const user of USER_FIXTURES) {
    await db
      .insert(users)
      .values({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        status: user.status,
        profileTimezone: user.profileTimezone,
        bufferMinutes: user.bufferMinutes,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          profileTimezone: user.profileTimezone,
          bufferMinutes: user.bufferMinutes,
          updatedAt: now,
        },
      });
  }

  for (const topic of TOPIC_FIXTURES) {
    await db
      .insert(topics)
      .values({
        id: topic.id,
        name: topic.name,
        status: topic.status,
        retiredAt: topic.status === "retired" ? now : null,
        proposedByUserId: topic.proposedByUserId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: topics.id,
        set: {
          name: topic.name,
          status: topic.status,
          retiredAt: topic.status === "retired" ? now : null,
          proposedByUserId: topic.proposedByUserId ?? null,
          updatedAt: now,
        },
      });
  }

  for (const proposal of TOPIC_PROPOSAL_FIXTURES) {
    await db
      .insert(topicProposals)
      .values({
        id: proposal.id,
        proposedByUserId: proposal.proposedByUserId,
        candidateName: proposal.candidateName,
        status: proposal.status,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: topicProposals.id,
        set: {
          proposedByUserId: proposal.proposedByUserId,
          candidateName: proposal.candidateName,
          status: proposal.status,
          updatedAt: now,
        },
      });
  }

  for (const window of AVAILABILITY_WINDOW_FIXTURES) {
    await db
      .insert(availabilityWindows)
      .values({
        id: window.id,
        userId: window.userId,
        dayOfWeek: window.dayOfWeek,
        startTime: window.startTime,
        endTime: window.endTime,
        profileTimezone: window.profileTimezone,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: availabilityWindows.id,
        set: {
          userId: window.userId,
          dayOfWeek: window.dayOfWeek,
          startTime: window.startTime,
          endTime: window.endTime,
          profileTimezone: window.profileTimezone,
          updatedAt: now,
        },
      });
  }

  for (const override of OVERRIDE_FIXTURES) {
    await db
      .insert(availabilityOverrides)
      .values({
        id: override.id,
        userId: override.userId,
        date: override.date,
        startTime: override.startTime,
        endTime: override.endTime,
        type: override.type,
        profileTimezone: override.profileTimezone,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: availabilityOverrides.id,
        set: {
          userId: override.userId,
          date: override.date,
          startTime: override.startTime,
          endTime: override.endTime,
          type: override.type,
          profileTimezone: override.profileTimezone,
          updatedAt: now,
        },
      });
  }

  for (const conn of CALENDAR_CONNECTION_FIXTURES) {
    await db
      .insert(calendarConnections)
      .values({
        id: conn.id,
        userId: conn.userId,
        provider: conn.provider,
        providerAccountKey: conn.providerAccountKey,
        accountIdentifier: conn.accountIdentifier,
        scopes: conn.scopes,
        status: conn.status,
        accessTokenExpiresAt: conn.accessTokenExpiresAt,
        contributingCalendarIds: conn.contributingCalendarIds,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: calendarConnections.id,
        set: {
          userId: conn.userId,
          provider: conn.provider,
          providerAccountKey: conn.providerAccountKey,
          accountIdentifier: conn.accountIdentifier,
          scopes: conn.scopes,
          status: conn.status,
          accessTokenExpiresAt: conn.accessTokenExpiresAt,
          contributingCalendarIds: conn.contributingCalendarIds,
          updatedAt: now,
        },
      });
  }

  for (const busy of IMPORTED_BUSY_INTERVAL_FIXTURES) {
    await db
      .insert(importedBusyIntervals)
      .values({
        id: busy.id,
        userId: busy.userId,
        connectionId: busy.connectionId,
        providerCalendarId: busy.providerCalendarId,
        providerEventReference: busy.providerEventReference,
        status: busy.status,
        startAt: busy.startAt,
        endAt: busy.endAt,
        importedAt: now,
      })
      .onConflictDoUpdate({
        target: importedBusyIntervals.id,
        set: {
          userId: busy.userId,
          connectionId: busy.connectionId,
          providerCalendarId: busy.providerCalendarId,
          providerEventReference: busy.providerEventReference,
          status: busy.status,
          startAt: busy.startAt,
          endAt: busy.endAt,
          importedAt: now,
        },
      });
  }

  for (const ut of USER_TOPIC_FIXTURES) {
    await db
      .insert(userTopics)
      .values({
        id: ut.id,
        userId: ut.userId,
        topicId: ut.topicId,
        status: ut.status,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userTopics.id,
        set: {
          userId: ut.userId,
          topicId: ut.topicId,
          status: ut.status,
          updatedAt: now,
        },
      });
  }

  for (const consent of DISCOVERABILITY_CONSENT_FIXTURES) {
    await db
      .insert(discoverabilityConsents)
      .values({
        userId: consent.userId,
        grantedAt: consent.grantedAt,
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: discoverabilityConsents.userId,
        set: {
          grantedAt: consent.grantedAt,
          revokedAt: null,
        },
      });
  }

  for (const session of SESSION_FIXTURES) {
    await db
      .insert(sessions)
      .values({
        id: session.id,
        userId: session.userId,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAt,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          userId: session.userId,
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt,
        },
      });
  }
}
