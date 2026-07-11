import { getSessionFromRequest } from "../../src/auth/session";
import {
  getProfileByUserId,
  updateProfileByUserId,
} from "../../src/profile/repository";
import { z } from "zod";

const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    avatarUrl: z.union([z.string().trim().min(1), z.null()]).optional(),
    shortBio: z.union([z.string().trim().min(1), z.null()]).optional(),
    profileTimezone: z.union([z.string().trim().min(1), z.null()]).optional(),
    bufferMinutes: z.number().int().nonnegative().optional(),
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

  return Response.json({
    user: profile,
    session: { csrfToken: session.csrfToken },
    setup: { complete: false },
    discoverability: { consented: false },
    topics: [],
    topicProposals: [],
    availabilityWindows: [],
    calendarConnections: [],
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
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

  const currentProfile = await getProfileByUserId(session.user.id);

  if (!currentProfile) {
    return Response.json({ error: "profile_not_found" }, { status: 404 });
  }

  const displayName =
    parsed.data.displayName ?? currentProfile.displayName?.trim();

  if (!displayName) {
    return Response.json({ error: "invalid_profile_update" }, { status: 400 });
  }

  const updatedProfile = await updateProfileByUserId(session.user.id, {
    displayName,
    avatarUrl:
      parsed.data.avatarUrl === undefined
        ? currentProfile.avatarUrl
        : parsed.data.avatarUrl,
    shortBio:
      parsed.data.shortBio === undefined
        ? currentProfile.shortBio
        : parsed.data.shortBio,
    profileTimezone:
      parsed.data.profileTimezone === undefined
        ? currentProfile.profileTimezone
        : parsed.data.profileTimezone,
    bufferMinutes:
      parsed.data.bufferMinutes === undefined
        ? currentProfile.bufferMinutes
        : parsed.data.bufferMinutes,
  });

  if (!updatedProfile) {
    return Response.json({ error: "profile_not_found" }, { status: 404 });
  }

  return Response.json({
    user: updatedProfile,
    session: { csrfToken: session.csrfToken },
    setup: { complete: false },
    discoverability: { consented: false },
    topics: [],
    topicProposals: [],
    availabilityWindows: [],
    calendarConnections: [],
  });
}
