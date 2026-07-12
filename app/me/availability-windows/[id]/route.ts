import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getSessionFromRequest } from "../../../../src/auth/session";
import {
  findWeeklyAvailabilityWindowById,
  removeWeeklyAvailabilityWindowById,
  updateWeeklyAvailabilityWindowById,
  type WeeklyAvailabilityWindow,
  type WeeklyAvailabilityWindowUpdate,
} from "../../../../src/profile/availability-windows";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const availabilityWindowUpdateSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    startTime: z
      .string()
      .regex(timeRegex, "startTime must be HH:MM")
      .optional(),
    endTime: z.string().regex(timeRegex, "endTime must be HH:MM").optional(),
  })
  .strict()
  .refine(
    (data) => !data.endTime || !data.startTime || data.endTime > data.startTime,
    {
      message: "endTime must be after startTime",
      path: ["endTime"],
    },
  );

type AvailabilityWindowResponse = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  profileTimezone: string;
  createdAt: string;
  updatedAt: string;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_availability_window" },
      { status: 400 },
    );
  }

  const parsed = availabilityWindowUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_availability_window" },
      { status: 400 },
    );
  }

  const updates: WeeklyAvailabilityWindowUpdate = {};

  if (parsed.data.dayOfWeek !== undefined) {
    updates.dayOfWeek = parsed.data.dayOfWeek;
  }
  if (parsed.data.startTime !== undefined) {
    updates.startTime = parsed.data.startTime;
  }
  if (parsed.data.endTime !== undefined) {
    updates.endTime = parsed.data.endTime;
  }

  const existing = await findWeeklyAvailabilityWindowById(id, session.user.id);

  if (!existing) {
    return Response.json(
      { error: "availability_window_not_found" },
      { status: 404 },
    );
  }

  const finalStartTime = updates.startTime ?? existing.startTime;
  const finalEndTime = updates.endTime ?? existing.endTime;

  if (finalEndTime <= finalStartTime) {
    return Response.json(
      { error: "invalid_availability_window" },
      { status: 400 },
    );
  }

  const window = await updateWeeklyAvailabilityWindowById(
    id,
    session.user.id,
    updates,
  );

  if (!window) {
    return Response.json(
      { error: "availability_window_not_found" },
      { status: 404 },
    );
  }

  return Response.json({ availabilityWindow: formatWindow(window) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  const { id } = await params;

  const removed = await removeWeeklyAvailabilityWindowById(id, session.user.id);

  if (!removed) {
    return Response.json(
      { error: "availability_window_not_found" },
      { status: 404 },
    );
  }

  return new Response(null, { status: 204 });
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
