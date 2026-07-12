import { NextRequest, NextResponse } from "next/server";
import { quickAddJob } from "graphile-worker";
import { createHmac } from "node:crypto";

import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { calendarSyncTaskName } from "../../../../src/worker/calendar-sync";
import type { CalendarSyncJobPayload } from "../../../../src/calendar/sync-jobs";
import { findCalendarConnectionById } from "../../../../src/calendar/repository";

export async function POST(request: NextRequest) {
  const config = loadRuntimeConfig();

  const channelId = request.headers.get("Google-Channel-ID") ?? "";
  const messageNumber = request.headers.get("Google-Message-Number") ?? "";
  const resourceId = request.headers.get("Google-Resource-ID") ?? "";
  const timestamp = request.headers.get("Google-Resource-URI") ?? "";
  const signature = request.headers.get("X-Goog-Signature") ?? "invalid";

  const payload = await request.text();

  const webhookSecret = process.env.GOOGLE_WEBHOOK_SECRET ?? "local-dev-secret";

  const parsed = JSON.parse(payload) as { resourceState?: string };

  if (parsed.resourceState === "revoked") {
    return new NextResponse(null, { status: 200 });
  }

  const signatureInput = `${channelId}${messageNumber}${timestamp}${payload}`;
  const expectedSignature = createHmac("sha256", webhookSecret)
    .update(signatureInput)
    .digest("base64url");

  if (signature !== expectedSignature) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const connection = await findCalendarConnectionById(resourceId);
  if (!connection || connection.record.status !== "connected") {
    return new NextResponse(null, { status: 200 });
  }

  const job: CalendarSyncJobPayload = { connectionId: resourceId };
  await quickAddJob(
    { connectionString: config.databaseUrl },
    calendarSyncTaskName,
    job,
  );

  return new NextResponse(null, { status: 200 });
}