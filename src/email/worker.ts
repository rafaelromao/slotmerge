import {
  triggerAdminCriticalEmail,
  type OperationalEvent,
  type TriggerAdminCriticalEmailDeps,
} from "../admin/critical-email";
import type {
  CreateEmailDeliveryServiceOptions,
  EmailEvent,
  EmailEventRepository,
  EmailTransport,
  QueueEmailJobInput,
} from "./service";

export type CriticalEmailTrigger = {
  trigger(
    event: OperationalEvent,
  ): Promise<{ deliveries: ReadonlyArray<unknown> }>;
};

export type CriticalEmailTriggerDeps = Omit<
  TriggerAdminCriticalEmailDeps,
  "clock"
>;

export type ProcessEmailDeliveryJobOptions = {
  clock?: NonNullable<CreateEmailDeliveryServiceOptions["clock"]>;
  eventRepository: Required<
    Pick<EmailEventRepository, "recordAttempt" | "markDelivered" | "markFailed">
  >;
  transport: EmailTransport;
  criticalEmail?: CriticalEmailTrigger;
};

export async function processEmailDeliveryJob(
  job: QueueEmailJobInput,
  {
    clock = () => new Date(),
    eventRepository,
    transport,
    criticalEmail,
  }: ProcessEmailDeliveryJobOptions,
): Promise<EmailEvent> {
  const attemptedAt = clock();
  await eventRepository.recordAttempt(job.emailEventId, attemptedAt);

  try {
    const transportResult = await transport.send(job);
    return await eventRepository.markDelivered(
      job.emailEventId,
      clock(),
      transportResult.providerMessageId,
    );
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    await eventRepository.markFailed(job.emailEventId, clock(), {
      code: normalizeErrorCode(failure.message),
      message: failure.message,
    });

    if (criticalEmail) {
      try {
        await criticalEmail.trigger(
          buildTransactionalEmailFailureEvent(job, failure, clock()),
        );
      } catch {
        // The trigger failure must never mask the original transport failure.
      }
    }

    throw failure;
  }
}

export function buildTransactionalEmailFailureEvent(
  job: QueueEmailJobInput,
  failure: Error,
  occurredAt: Date,
): OperationalEvent {
  return {
    kind: "transactional-email-failure",
    summary: `Transactional email delivery failed: ${failure.message}`,
    occurredAt,
    details: {
      emailEventId: job.emailEventId,
      recipient: job.recipient,
      emailType: job.type,
      error: failure.message,
    },
  };
}

export function createCriticalEmailTrigger(
  deps: CriticalEmailTriggerDeps,
): CriticalEmailTrigger {
  return {
    trigger(event) {
      return triggerAdminCriticalEmail({ event }, deps);
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
