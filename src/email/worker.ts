import type {
  CreateEmailDeliveryServiceOptions,
  EmailEvent,
  EmailEventRepository,
  EmailTransport,
  QueueEmailJobInput,
} from "./service";

export type ProcessEmailDeliveryJobOptions = {
  clock?: NonNullable<CreateEmailDeliveryServiceOptions["clock"]>;
  eventRepository: Required<
    Pick<EmailEventRepository, "recordAttempt" | "markDelivered" | "markFailed">
  >;
  transport: EmailTransport;
};

export async function processEmailDeliveryJob(
  job: QueueEmailJobInput,
  {
    clock = () => new Date(),
    eventRepository,
    transport,
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
    throw failure;
  }
}

function normalizeErrorCode(message: string): string {
  const code = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return code || "unknown";
}
