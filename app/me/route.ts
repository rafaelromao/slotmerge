import { getSessionFromRequest } from "../../src/auth/session";
import {
  getProfileByUserId,
  updateProfileByUserId,
} from "../../src/profile/repository";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

const supportedTimeZones = new Set(Intl.supportedValuesOf("timeZone"));

type MeProfile = NonNullable<Awaited<ReturnType<typeof getProfileByUserId>>>;

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

  return buildMeResponse(profile, session.csrfToken);
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

  return buildMeResponse(updatedProfile, session.csrfToken);
}

function buildMeResponse(profile: MeProfile, csrfToken: string): Response {
  return Response.json({
    user: profile,
    session: { csrfToken },
    setup: { complete: Boolean(profile.displayName?.trim()) },
    discoverability: { consented: false },
    topics: [],
    topicProposals: [],
    availabilityWindows: [],
    calendarConnections: [],
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
