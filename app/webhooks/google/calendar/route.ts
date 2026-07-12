import { NextRequest, NextResponse } from "next/server";
import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../../../../src/config/runtime";
import { calendarSyncTaskName } from "../../../../src/worker/calendar-sync";
import type { CalendarSyncJobPayload } from "../../../../src/calendar/sync-jobs";
import { findCalendarConnectionById } from "../../../../src/calendar/repository";

export async function POST(request: NextRequest) {
  const config = loadRuntimeConfig();

  const channelId = request.headers.get("X-Goog-Channel-ID") ?? "";
  const resourceState = request.headers.get("X-Goog-Resource-State") ?? "";

  if (resourceState === "revoked") {
    return new NextResponse(null, { status: 200 });
  }

  const connection = await findCalendarConnectionById(channelId);
  if (!connection || connection.record.status !== "connected") {
    return new NextResponse(null, { status: 200 });
  }

  const job: CalendarSyncJobPayload = { connectionId: connection.record.id };
  await quickAddJob(
    { connectionString: config.databaseUrl },
    calendarSyncTaskName,
    job,
  );

  return new NextResponse(null, { status: 200 });
}
