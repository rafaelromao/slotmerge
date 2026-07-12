import { NextRequest, NextResponse } from "next/server";
import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { calendarSyncTaskName } from "../../../../src/worker/calendar-sync";
import type { CalendarSyncJobPayload } from "../../../../src/calendar/sync-jobs";
import { findCalendarConnectionById } from "../../../../src/calendar/repository";

export async function POST(request: NextRequest) {
  const config = loadRuntimeConfig();

  const webhookType = request.headers.get("X-MS-WEBHOOK-TYPE") ?? "";
  const validationToken = request.nextUrl.searchParams.get("Validationtoken");

  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  if (webhookType === "validation") {
    return new NextResponse(null, { status: 200 });
  }

  const payload = await request.text();
  const parsed = JSON.parse(payload) as { clientState?: string };

  const clientState = parsed.clientState;
  if (!clientState) {
    return new NextResponse("Missing clientState", { status: 400 });
  }

  const connection = await findCalendarConnectionById(clientState);
  if (!connection || connection.record.status !== "connected") {
    return new NextResponse(null, { status: 200 });
  }

  const job: CalendarSyncJobPayload = { connectionId: clientState };
  await quickAddJob(
    { connectionString: config.databaseUrl },
    calendarSyncTaskName,
    job,
  );

  return new NextResponse(null, { status: 200 });
}