import { loadRuntimeConfig } from "../config/runtime";
import { createPostgresEmailEventRepository } from "../email/repository";
import { createEmailTransport } from "../email/transport";
import { processEmailDeliveryJob } from "../email/worker";
import type { QueueEmailJobInput } from "../email/service";

export const emailDeliveryTaskName = "deliver_email";

export async function handleEmailDeliveryJob(payload: unknown): Promise<void> {
  const job = parseEmailDeliveryJob(payload);
  const config = loadRuntimeConfig();

  await processEmailDeliveryJob(job, {
    eventRepository: createPostgresEmailEventRepository(),
    transport: createEmailTransport({
      adapter: config.emailAdapter,
      env: process.env,
    }),
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
    typeof payload.type === "string" &&
    typeof payload.payload === "object" &&
    payload.payload !== null
  ) {
    return {
      emailEventId: payload.emailEventId,
      recipient: payload.recipient,
      type: payload.type as QueueEmailJobInput["type"],
      payload: payload.payload as QueueEmailJobInput["payload"],
    };
  }

  throw new Error(
    "email delivery job requires event, recipient, type, and payload",
  );
}
