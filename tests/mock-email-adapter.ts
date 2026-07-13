import type { QueueEmailJobInput } from "../src/email/service";

export type MockEmailSendRecord = {
  emailEventId: string;
  recipient: string;
  type: QueueEmailJobInput["type"];
  payload: QueueEmailJobInput["payload"];
  status: "sent" | "failed";
  providerMessageId: string | null;
  attemptNumber: number;
  error: string | null;
};

export type MockEmailAdapter = {
  sends: MockEmailSendRecord[];
  send(job: QueueEmailJobInput): Promise<{ providerMessageId: string }>;
  setPersistentFailure(error: string): void;
  setNextSendFailure(error: string): void;
  setSucceedsOnAttempt(n: number, error?: string): void;
  getSendsByRecipient(recipient: string): MockEmailSendRecord[];
  getSendsByType(type: QueueEmailJobInput["type"]): MockEmailSendRecord[];
  reset(): void;
};

type FailureMode =
  | { kind: "none" }
  | { kind: "persistent"; error: string }
  | { kind: "next"; error: string }
  | { kind: "after-attempts"; n: number; error: string };

export function buildMockEmailAdapter(): MockEmailAdapter {
  const sends: MockEmailSendRecord[] = [];
  const attemptsByEmailEventId = new Map<string, number>();
  let failureMode: FailureMode = { kind: "none" };
  const defaultError = "mock delivery failure";

  async function send(
    job: QueueEmailJobInput,
  ): Promise<{ providerMessageId: string }> {
    const attempts = (attemptsByEmailEventId.get(job.emailEventId) ?? 0) + 1;
    attemptsByEmailEventId.set(job.emailEventId, attempts);

    let status: "sent" | "failed" = "sent";
    let msgId: string | null = `mock-${job.emailEventId}`;
    let error: string | null = null;

    if (shouldFail(attempts)) {
      const errorMessage =
        failureMode.kind === "none" ? defaultError : failureMode.error;
      error = errorMessage;
      status = "failed";
      msgId = null;
      if (failureMode.kind === "next") {
        failureMode = { kind: "none" };
      }
      sends.push({
        emailEventId: job.emailEventId,
        recipient: job.recipient,
        type: job.type,
        payload: job.payload,
        status,
        providerMessageId: msgId,
        attemptNumber: attempts,
        error,
      });
      throw new Error(errorMessage);
    }

    sends.push({
      emailEventId: job.emailEventId,
      recipient: job.recipient,
      type: job.type,
      payload: job.payload,
      status,
      providerMessageId: msgId,
      attemptNumber: attempts,
      error,
    });
    return await Promise.resolve({ providerMessageId: msgId });
  }

  function shouldFail(attempts: number): boolean {
    switch (failureMode.kind) {
      case "none":
        return false;
      case "persistent":
        return true;
      case "next":
        return true;
      case "after-attempts":
        return attempts < failureMode.n;
      default:
        return false;
    }
  }

  function setPersistentFailure(error: string): void {
    failureMode = { kind: "persistent", error };
  }

  function setNextSendFailure(error: string): void {
    failureMode = { kind: "next", error };
  }

  function setSucceedsOnAttempt(n: number, error = defaultError): void {
    failureMode = { kind: "after-attempts", n, error };
  }

  function getSendsByRecipient(
    recipient: string,
  ): MockEmailSendRecord[] {
    return sends.filter((s) => s.recipient === recipient);
  }

  function getSendsByType(
    type: QueueEmailJobInput["type"],
  ): MockEmailSendRecord[] {
    return sends.filter((s) => s.type === type);
  }

  function reset(): void {
    sends.length = 0;
    attemptsByEmailEventId.clear();
    failureMode = { kind: "none" };
  }

  return {
    get sends() {
      return sends;
    },
    send,
    setPersistentFailure,
    setNextSendFailure,
    setSucceedsOnAttempt,
    getSendsByRecipient,
    getSendsByType,
    reset,
  };
}
