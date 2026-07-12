import { timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { getSessionFromRequest } from "../../../src/auth/session";
import {
  grantDiscoverabilityConsent,
  revokeDiscoverabilityConsent,
} from "../../../src/profile/discoverability-consent";

const consentGrantSchema = z
  .object({
    confirmed: z.literal(true),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
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
    return Response.json({ error: "invalid_consent_request" }, { status: 400 });
  }

  const parsed = consentGrantSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json({ error: "invalid_consent_request" }, { status: 400 });
  }

  const record = await grantDiscoverabilityConsent(session.user.id);

  return Response.json({
    discoverability: {
      consented: true,
      grantedAt: record.grantedAt.toISOString(),
    },
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!hasValidCsrfToken(request, session.csrfToken)) {
    return Response.json({ error: "invalid_csrf" }, { status: 403 });
  }

  await revokeDiscoverabilityConsent(session.user.id);

  return Response.json({
    discoverability: { consented: false },
  });
}

function hasValidCsrfToken(request: Request, expectedToken: string): boolean {
  const actualToken = request.headers.get("x-csrf-token");

  if (!actualToken || actualToken.length !== expectedToken.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(actualToken), Buffer.from(expectedToken));
}
