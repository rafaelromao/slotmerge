import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { createPostgresAccountRepository } from "../../../../src/account/repository";
import {
  clearSessionCookie,
  getSessionFromRequest,
} from "../../../../src/auth/session";
import { getDiscoverabilityConsent } from "../../../../src/profile/discoverability-consent";
import {
  getProfileByUserId,
  updateProfileByUserId,
} from "../../../../src/profile/repository";
import {
  isEligibleForSearch,
  type ProfileInputs,
} from "../../../../src/search/search-snapshot-assembler";
import { type TopicProposalStatus } from "../../../../src/db/schema";
import { createAccountWorkflow } from "../../../../src/workflow/account";

const supportedTimeZones = new Set(Intl.supportedValuesOf("timeZone"));

type MeProfile = NonNullable<Awaited<ReturnType<typeof getProfileByUserId>>>;

type Topic = { id: string; name: string };
type TopicProposal = { id: string; name: string; status: TopicProposalStatus };
type AvailabilityWindow = { id: string; dayOfWeek: number };
type AvailabilityOverride = { id: string; date: string };
type CalendarConnection = { id: string; provider: string };

type SetupItem = {
  key: string;
  label: string;
  required: boolean;
  complete: boolean;
};

type SetupState = {
  complete: boolean;
  items: SetupItem[];
};

function computeSetupCompleteness(
  profile: MeProfile,
  topics: Topic[],
  topicProposals: TopicProposal[],
  availabilityWindows: AvailabilityWindow[],
  availabilityOverrides: AvailabilityOverride[],
  calendarConnections: CalendarConnection[],
  discoverabilityConsentGranted: boolean,
): SetupState {
  const items: SetupItem[] = [
    {
      key: "displayName",
      label: "Display name",
      required: true,
      complete: Boolean(profile.displayName?.trim()),
    },
    {
      key: "discoverabilityConsent",
      label: "Discoverability consent",
      required: true,
      complete: discoverabilityConsentGranted,
    },
    {
      key: "hasTopic",
      label: "At least one Topic or Topic Proposal",
      required: true,
      complete: topics.length > 0 || topicProposals.length > 0,
    },
    {
      key: "hasAvailability",
      label: "At least one Availability source or manual Availability Window",
      required: true,
      complete:
        availabilityWindows.length > 0 ||
        availabilityOverrides.length > 0 ||
        calendarConnections.length > 0,
    },
    {
      key: "hasCalendarConnection",
      label: "Calendar Connection",
      required: false,
      complete: calendarConnections.length > 0,
    },
  ];

  const requiredItemsComplete = items
    .filter((i) => i.required)
    .every((i) => i.complete);

  return {
    complete: requiredItemsComplete,
    items,
  };
}

type PerUserLookupSeam = {
  topicsByUserId: Map<string, Topic[]>;
  topicProposalsByUserId: Map<string, TopicProposal[]>;
  availabilityWindowsByUserId: Map<string, AvailabilityWindow[]>;
  availabilityOverridesByUserId: Map<string, AvailabilityOverride[]>;
  calendarConnectionsByUserId: Map<string, CalendarConnection[]>;
};

const perUserLookupState: PerUserLookupSeam = {
  topicsByUserId: new Map(),
  topicProposalsByUserId: new Map(),
  availabilityWindowsByUserId: new Map(),
  availabilityOverridesByUserId: new Map(),
  calendarConnectionsByUserId: new Map(),
};

export function setPerUserLookupStateForTests(
  state: Partial<PerUserLookupSeam>,
) {
  if (state.topicsByUserId) {
    perUserLookupState.topicsByUserId = state.topicsByUserId;
  }
  if (state.topicProposalsByUserId) {
    perUserLookupState.topicProposalsByUserId = state.topicProposalsByUserId;
  }
  if (state.availabilityWindowsByUserId) {
    perUserLookupState.availabilityWindowsByUserId =
      state.availabilityWindowsByUserId;
  }
  if (state.availabilityOverridesByUserId) {
    perUserLookupState.availabilityOverridesByUserId =
      state.availabilityOverridesByUserId;
  }
  if (state.calendarConnectionsByUserId) {
    perUserLookupState.calendarConnectionsByUserId =
      state.calendarConnectionsByUserId;
  }
}

export function clearPerUserLookupStateForTests() {
  perUserLookupState.topicsByUserId.clear();
  perUserLookupState.topicProposalsByUserId.clear();
  perUserLookupState.availabilityWindowsByUserId.clear();
  perUserLookupState.availabilityOverridesByUserId.clear();
  perUserLookupState.calendarConnectionsByUserId.clear();
}

function deletePerUserData(userId: string) {
  perUserLookupState.topicsByUserId.delete(userId);
  perUserLookupState.topicProposalsByUserId.delete(userId);
  perUserLookupState.availabilityWindowsByUserId.delete(userId);
  perUserLookupState.availabilityOverridesByUserId.delete(userId);
  perUserLookupState.calendarConnectionsByUserId.delete(userId);
}

function getTopicsByUserId(userId: string): Promise<Topic[]> {
  return Promise.resolve(perUserLookupState.topicsByUserId.get(userId) ?? []);
}

function getTopicProposalsByUserId(userId: string): Promise<TopicProposal[]> {
  return Promise.resolve(
    perUserLookupState.topicProposalsByUserId.get(userId) ?? [],
  );
}

function getAvailabilityWindowsByUserId(
  userId: string,
): Promise<AvailabilityWindow[]> {
  return Promise.resolve(
    perUserLookupState.availabilityWindowsByUserId.get(userId) ?? [],
  );
}

function getAvailabilityOverridesByUserId(
  userId: string,
): Promise<AvailabilityOverride[]> {
  return Promise.resolve(
    perUserLookupState.availabilityOverridesByUserId.get(userId) ?? [],
  );
}

function getCalendarConnectionsByUserId(
  userId: string,
): Promise<CalendarConnection[]> {
  return Promise.resolve(
    perUserLookupState.calendarConnectionsByUserId.get(userId) ?? [],
  );
}

export function listTopicsForUserInTests(userId: string): Promise<Topic[]> {
  return getTopicsByUserId(userId);
}

export function listAvailabilityWindowsForUserInTests(
  userId: string,
): Promise<AvailabilityWindow[]> {
  return getAvailabilityWindowsByUserId(userId);
}

export function listAvailabilityOverridesForUserInTests(
  userId: string,
): Promise<AvailabilityOverride[]> {
  return getAvailabilityOverridesByUserId(userId);
}

export function listCalendarConnectionsForUserInTests(
  userId: string,
): Promise<CalendarConnection[]> {
  return getCalendarConnectionsByUserId(userId);
}

const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    avatarUrl: z.union([z.string().trim().url(), z.null()]).optional(),
    shortBio: z.union([z.string().trim().min(1), z.null()]).optional(),
    profileTimezone: z
      .union([z.string().trim().min(1).refine(isSupportedTimeZone), z.null()])
      .optional(),
    bufferMinutes: z.number().int().nonnegative().max(720).optional(),
  })
  .strict();

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const profile = await getProfileByUserId(session.user.id);

  if (!profile) {
    return Response.json({ error: "profile_not_found" }, { status: 404 });
  }

  const [
    topics,
    topicProposals,
    availabilityWindows,
    availabilityOverrides,
    calendarConnections,
  ] = await Promise.all([
    getTopicsByUserId(session.user.id),
    getTopicProposalsByUserId(session.user.id),
    getAvailabilityWindowsByUserId(session.user.id),
    getAvailabilityOverridesByUserId(session.user.id),
    getCalendarConnectionsByUserId(session.user.id),
  ]);

  return buildMeResponse(
    profile,
    session.csrfToken,
    topics,
    topicProposals,
    availabilityWindows,
    availabilityOverrides,
    calendarConnections,
  );
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_profile_update" }, { status: 400 });
  }

  const parsed = profileUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "invalid_profile_update" }, { status: 400 });
  }

  const updatedProfile = await updateProfileByUserId(
    session.user.id,
    parsed.data,
  );

  if (!updatedProfile) {
    return Response.json({ error: "profile_not_found" }, { status: 404 });
  }

  const [
    topics,
    topicProposals,
    availabilityWindows,
    availabilityOverrides,
    calendarConnections,
  ] = await Promise.all([
    getTopicsByUserId(session.user.id),
    getTopicProposalsByUserId(session.user.id),
    getAvailabilityWindowsByUserId(session.user.id),
    getAvailabilityOverridesByUserId(session.user.id),
    getCalendarConnectionsByUserId(session.user.id),
  ]);

  return buildMeResponse(
    updatedProfile,
    session.csrfToken,
    topics,
    topicProposals,
    availabilityWindows,
    availabilityOverrides,
    calendarConnections,
  );
}

async function buildMeResponse(
  profile: MeProfile,
  csrfToken: string,
  topics: Topic[],
  topicProposals: TopicProposal[],
  availabilityWindows: AvailabilityWindow[],
  availabilityOverrides: AvailabilityOverride[],
  calendarConnections: CalendarConnection[],
): Promise<Response> {
  const consent = await getDiscoverabilityConsent(profile.id);
  const consented = consent?.state === "granted";
  const grantedAtIso =
    consented && consent.state === "granted"
      ? consent.grantedAt.toISOString()
      : null;

  const setup = computeSetupCompleteness(
    profile,
    topics,
    topicProposals,
    availabilityWindows,
    availabilityOverrides,
    calendarConnections,
    consented,
  );

  const profileInputs: ProfileInputs = {
    hasDisplayName: Boolean(profile.displayName?.trim()),
    hasTopicOrProposal: topics.length > 0 || topicProposals.length > 0,
    hasAvailabilitySource:
      availabilityWindows.length > 0 ||
      availabilityOverrides.length > 0 ||
      calendarConnections.length > 0,
    isActive: profile.status === "active",
  };

  const eligible = isEligibleForSearch(profileInputs, consented);

  return Response.json({
    user: profile,
    session: { csrfToken },
    setup,
    discoverability:
      grantedAtIso === null
        ? { consented: false, grantedAt: null }
        : { consented: true, grantedAt: grantedAtIso },
    topics,
    topicProposals,
    availabilityWindows,
    availabilityOverrides,
    calendarConnections,
    searchEligibility: { eligible },
  });
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}

function isSupportedTimeZone(timeZone: string): boolean {
  return supportedTimeZones.has(timeZone);
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  const accountWorkflow = createAccountWorkflow({
    repository: createPostgresAccountRepository(),
  });
  const result = await accountWorkflow.selfDelete({
    userId: session.user.id,
  });

  if (!result.ok) {
    return Response.json({ error: "user_not_found" }, { status: 404 });
  }

  deletePerUserData(session.user.id);

  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
