import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getSessionFromRequest } from "../../../src/auth/session";
import {
  addAvailabilityOverride,
  listAvailabilityOverridesByUserId,
  type AvailabilityOverride,
} from "../../../src/profile/availability-overrides";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const availabilityOverrideCreateSchema = z
  .object({
    date: z.string().regex(dateRegex, "date must be YYYY-MM-DD"),
    startTime: z.string().regex(timeRegex, "startTime must be HH:MM"),
    endTime: z.string().regex(timeRegex, "endTime must be HH:MM"),
    type: z.enum(["add", "block"]),
  })
  .strict()
  .refine((data) => data.endTime > data.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

type AvailabilityOverrideResponse = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  type: "add" | "block";
  profileTimezone: string;
  createdAt: string;
  updatedAt: string;
};

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const overrides = await listAvailabilityOverridesByUserId(session.user.id);

  return Response.json({
    availabilityOverrides: overrides.map(formatOverride),
  });
}

export async function POST(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  if (!session.user.profileTimezone) {
    return Response.json(
      { error: "profile_timezone_required" },
      { status: 400 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_availability_override" },
      { status: 400 },
    );
  }

  const parsed = availabilityOverrideCreateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_availability_override" },
      { status: 400 },
    );
  }

  const override = await addAvailabilityOverride(
    session.user.id,
    {
      date: parsed.data.date,
      startTime: parsed.data.startTime,
      endTime: parsed.data.endTime,
      type: parsed.data.type,
    },
    session.user.profileTimezone,
  );

  return Response.json(
    { availabilityOverride: formatOverride(override) },
    { status: 201 },
  );
}

function formatOverride(
  override: AvailabilityOverride,
): AvailabilityOverrideResponse {
  return {
    id: override.id,
    date: override.date,
    startTime: override.startTime,
    endTime: override.endTime,
    type: override.type,
    profileTimezone: override.profileTimezone,
    createdAt: override.createdAt.toISOString(),
    updatedAt: override.updatedAt.toISOString(),
  };
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
