import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getSessionFromRequest } from "../../../src/auth/session";
import {
  addWeeklyAvailabilityWindow,
  listWeeklyAvailabilityWindowsByUserId,
  type WeeklyAvailabilityWindow,
} from "../../../src/profile/availability-windows";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const availabilityWindowCreateSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(timeRegex, "startTime must be HH:MM"),
    endTime: z.string().regex(timeRegex, "endTime must be HH:MM"),
  })
  .strict()
  .refine((data) => data.endTime > data.startTime, {
    message: "endTime must be after startTime",
    path: ["endTime"],
  });

type AvailabilityWindowResponse = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  profileTimezone: string;
  createdAt: string;
  updatedAt: string;
};

export async function GET(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const windows = await listWeeklyAvailabilityWindowsByUserId(session.user.id);

  return Response.json({
    availabilityWindows: windows.map(formatWindow),
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
      { error: "invalid_availability_window" },
      { status: 400 },
    );
  }

  const parsed = availabilityWindowCreateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_availability_window" },
      { status: 400 },
    );
  }

  try {
    const window = await addWeeklyAvailabilityWindow(
      session.user.id,
      {
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
      },
      session.user.profileTimezone,
    );

    return Response.json(
      { availabilityWindow: formatWindow(window) },
      { status: 201 },
    );
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return Response.json(
        { error: "duplicate_availability_window" },
        { status: 409 },
      );
    }
    throw err;
  }
}

function formatWindow(
  window: WeeklyAvailabilityWindow,
): AvailabilityWindowResponse {
  return {
    id: window.id,
    dayOfWeek: window.dayOfWeek,
    startTime: window.startTime,
    endTime: window.endTime,
    profileTimezone: window.profileTimezone,
    createdAt: window.createdAt.toISOString(),
    updatedAt: window.updatedAt.toISOString(),
  };
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
