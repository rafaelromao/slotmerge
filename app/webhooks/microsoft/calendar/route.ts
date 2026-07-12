import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { calendarSyncTaskName } from "../../../../src/worker/calendar-sync";
import type { CalendarSyncJobPayload } from "../../../../src/calendar/sync-jobs";
import { findCalendarConnectionById } from "../../../../src/calendar/repository";

export async function POST(request: NextRequest) {
  const config = loadRuntimeConfig();

  const webhookType = request.headers.get("X-MS-WEBHOOK-TYPE") ?? "";

  const rawUrl = request.nextUrl.toString();
  const validationTokenMatch = rawUrl.match(/[?&]validationToken=([^&]+)/i);
  const validationTokenParam = validationTokenMatch
    ? validationTokenMatch[1]
    : null;

  if (validationTokenParam) {
    return new NextResponse(validationTokenParam, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (webhookType === "validation") {
    return new NextResponse(null, { status: 200 });
  }

  const payload = await request.text();
  const signature = request.headers.get("X-MS-WEBHOOK-SIGNATURE") ?? "";

  const parsed = JSON.parse(payload) as { clientState?: string };

  const clientState = parsed.clientState;
  if (!clientState) {
    return new NextResponse("Missing clientState", { status: 400 });
  }

  const connection = await findCalendarConnectionById(clientState);
  if (!connection || connection.record.status !== "connected") {
    return new NextResponse(null, { status: 200 });
  }

  const hmacSecret = clientState;
  const expectedSignature = `sha256=${createHmac("sha256", hmacSecret)
    .update(payload)
    .digest("hex")}`;

  if (signature !== expectedSignature) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const job: CalendarSyncJobPayload = { connectionId: clientState };
  await quickAddJob(
    { connectionString: config.databaseUrl },
    calendarSyncTaskName,
    job,
  );

  return new NextResponse(null, { status: 200 });
}
