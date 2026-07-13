import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getSessionFromRequest } from "../../../../src/auth/session";
import {
  findAvailabilityOverrideById,
  removeAvailabilityOverrideById,
  type AvailabilityOverride,
} from "../../../../src/profile/availability-overrides";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const availabilityOverrideUpdateSchema = z
  .object({
    startTime: z
      .string()
      .regex(timeRegex, "startTime must be HH:MM")
      .optional(),
    endTime: z.string().regex(timeRegex, "endTime must be HH:MM").optional(),
    type: z.enum(["add", "block"]).optional(),
  })
  .strict()
  .refine(
    (data) => !data.endTime || !data.startTime || data.endTime > data.startTime,
    {
      message: "endTime must be after startTime",
      path: ["endTime"],
    },
  );

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
      { error: "invalid_availability_override" },
      { status: 400 },
    );
  }

  const parsed = availabilityOverrideUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "invalid_availability_override" },
      { status: 400 },
    );
  }

  const existing = await findAvailabilityOverrideById(id, session.user.id);

  if (!existing) {
    return Response.json(
      { error: "availability_override_not_found" },
      { status: 404 },
    );
  }

  return Response.json({
    availabilityOverride: formatOverride(existing),
  });
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

  const removed = await removeAvailabilityOverrideById(id, session.user.id);

  if (!removed) {
    return Response.json(
      { error: "availability_override_not_found" },
      { status: 404 },
    );
  }

  return new Response(null, { status: 204 });
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
