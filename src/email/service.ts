import { createHash } from "node:crypto";

import type { Clock } from "../system/clock";

export type EmailType =
  "invite" | "magic-link" | "calendar-action-required" | "admin-critical";

export type EmailPayload = Record<string, unknown>;

export type EmailEvent = {
  id: string;
  recipient: string;
  type: EmailType;
  payloadReference: string;
  status: "queued" | "sending" | "sent" | "failed";
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  sentAt: Date | null;
  failedAt: Date | null;
  lastAttemptAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

export type CreateQueuedEmailEventInput = {
  recipient: string;
  type: EmailType;
  payloadReference: string;
  createdAt: Date;
};

export type EmailEventRepository = {
  createQueuedEvent(input: CreateQueuedEmailEventInput): Promise<EmailEvent>;
  recordAttempt(emailEventId: string, attemptedAt: Date): Promise<EmailEvent>;
  markDelivered(
    emailEventId: string,
    deliveredAt: Date,
    providerMessageId?: string | null,
  ): Promise<EmailEvent>;
  markFailed(
    emailEventId: string,
    failedAt: Date,
    error: { code?: string | null; message: string },
  ): Promise<EmailEvent>;
};

export type QueueEmailJobInput = {
  emailEventId: string;
  recipient: string;
  type: EmailType;
  payload: EmailPayload;
};

export type EmailTransport = {
  send(job: QueueEmailJobInput): Promise<{ providerMessageId: string }>;
};

export type QueueEmailJob = (job: QueueEmailJobInput) => Promise<void>;

export type CreateEmailDeliveryServiceOptions = {
  clock: Clock;
  eventRepository: EmailEventRepository;
  queueJob?: QueueEmailJob;
};

export type EmailDeliveryService = {
  sendEmail(input: {
    recipient: string;
    type: EmailType;
    payload: EmailPayload;
    payloadReference?: string;
  }): Promise<{ emailEvent: EmailEvent }>;
};

export function createPayloadReference(payload: EmailPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function createEmailDeliveryService({
  clock,
  eventRepository,
  queueJob = () => Promise.resolve(),
}: CreateEmailDeliveryServiceOptions): EmailDeliveryService {
  return {
    async sendEmail(input) {
      const createdAt = clock.now();
      const payloadReference =
        input.payloadReference ?? createPayloadReference(input.payload);
      const emailEvent = await eventRepository.createQueuedEvent({
        recipient: input.recipient,
        type: input.type,
        payloadReference,
        createdAt,
      });

      try {
        await queueJob({
          emailEventId: emailEvent.id,
          recipient: input.recipient,
          type: input.type,
          payload: input.payload,
        });
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error));
        await eventRepository.markFailed(emailEvent.id, clock.now(), {
          code: normalizeErrorCode(failure.message),
          message: failure.message,
        });
        throw failure;
      }

      return { emailEvent };
    },
  };
}

function normalizeErrorCode(message: string): string {
  const code = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return code || "unknown";
}
