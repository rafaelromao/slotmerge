import { quickAddJob } from "graphile-worker";

import {
  createPostgresAdminCriticalDispatchLookup,
  createPostgresAdminDirectory,
} from "../admin/critical-email.repository";
import { loadRuntimeConfig } from "../config/runtime";
import { createPostgresEmailEventRepository } from "../email/repository";
import {
  createEmailDeliveryService,
  type EmailTransport,
} from "../email/service";
import { createEmailTransport } from "../email/transport";
import {
  createCriticalEmailTrigger,
  processEmailDeliveryJob,
} from "../email/worker";
import type { QueueEmailJobInput } from "../email/service";
import type { Clock } from "../system/clock";

export const emailDeliveryTaskName = "deliver_email";

let emailTransportOverride: EmailTransport | null = null;

export function setEmailTransportForTests(
  transport: EmailTransport | null,
): void {
  emailTransportOverride = transport;
}

export type HandleEmailDeliveryJobDeps = {
  clock: Clock;
};

export async function handleEmailDeliveryJob(
  payload: unknown,
  deps: HandleEmailDeliveryJobDeps,
): Promise<void> {
  const job = parseEmailDeliveryJob(payload);
  const config = loadRuntimeConfig();

  const eventRepository = createPostgresEmailEventRepository();
  const transport =
    emailTransportOverride ??
    createEmailTransport({
      adapter: config.emailAdapter,
      env: process.env,
    });
  const emailDeliveryService = createEmailDeliveryService({
    eventRepository,
    queueJob: (queued) => enqueueEmailDeliveryJob(queued, config.databaseUrl),
  });
  const criticalEmail = createCriticalEmailTrigger({
    adminDirectory: createPostgresAdminDirectory(),
    emailDeliveryService,
    lastDispatchLookup: createPostgresAdminCriticalDispatchLookup(),
  });

  await processEmailDeliveryJob(job, {
    clock: deps.clock.now,
    eventRepository,
    transport,
    criticalEmail,
  });
}

async function enqueueEmailDeliveryJob(
  job: QueueEmailJobInput,
  databaseUrl: string,
): Promise<void> {
  await quickAddJob({ connectionString: databaseUrl }, emailDeliveryTaskName, {
    emailEventId: job.emailEventId,
    recipient: job.recipient,
    type: job.type,
    payload: job.payload,
  });
}

function parseEmailDeliveryJob(payload: unknown): QueueEmailJobInput {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "emailEventId" in payload &&
    "recipient" in payload &&
    "type" in payload &&
    "payload" in payload &&
    typeof payload.emailEventId === "string" &&
    typeof payload.recipient === "string" &&
    isEmailType(payload.type) &&
    typeof payload.payload === "object" &&
    payload.payload !== null
  ) {
    return {
      emailEventId: payload.emailEventId,
      recipient: payload.recipient,
      type: payload.type,
      payload: payload.payload as QueueEmailJobInput["payload"],
    };
  }

  throw new Error(
    "email delivery job requires event, recipient, type, and payload",
  );
}

function isEmailType(value: unknown): value is QueueEmailJobInput["type"] {
  return (
    value === "invite" ||
    value === "magic-link" ||
    value === "calendar-action-required" ||
    value === "admin-critical"
  );
}
