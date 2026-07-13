/**
 * Mock email adapter that records every send() call.
 * Use assertDelivered() and findByRecipient() in tests to verify email delivery.
 *
 * E2E coverage: PRD stories 1-5 → tests 1-7
 */

import type { EmailType } from "../../../src/email/service";
import type { QueueEmailJobInput } from "../../../src/email/service";

export type RecordedEmail = {
  recipient: string;
  type: EmailType;
  payload: Record<string, unknown>;
  providerMessageId: string;
  sentAt: Date;
};

export class MockEmailAdapter {
  private static _sent: RecordedEmail[] = [];

  static reset(): void {
    this._sent = [];
  }

  static record(job: QueueEmailJobInput, providerMessageId: string): void {
    this._sent.push({
      recipient: job.recipient,
      type: job.type,
      payload: job.payload,
      providerMessageId,
      sentAt: new Date(),
    });
  }

  static findByRecipient(email: string): RecordedEmail[] {
    return this._sent.filter((e) => e.recipient === email);
  }

  static findByType(type: EmailType): RecordedEmail[] {
    return this._sent.filter((e) => e.type === type);
  }

  static findByRecipientAndType(
    email: string,
    type: EmailType,
  ): RecordedEmail | undefined {
    return this._sent.find((e) => e.recipient === email && e.type === type);
  }

  static assertDelivered(
    recipient: string,
    type: EmailType,
    message?: string,
  ): void {
    const email = this.findByRecipientAndType(recipient, type);
    if (!email) {
      const all = this._sent
        .filter((e) => e.recipient === recipient)
        .map((e) => e.type);
      throw new Error(
        message ??
          `Expected email to ${recipient} of type ${type} not found. Found types: [${all.join(", ")}]`,
      );
    }
  }

  static assertNotDelivered(recipient: string, type: EmailType): void {
    const email = this.findByRecipientAndType(recipient, type);
    if (email) {
      throw new Error(
        `Expected no ${type} email to ${recipient} but found one with providerMessageId=${email.providerMessageId}`,
      );
    }
  }

  static lastDelivery(
    recipient: string,
    type: EmailType,
  ): RecordedEmail | undefined {
    const found = this.findByRecipientAndType(recipient, type);
    return found;
  }

  static get all(): readonly RecordedEmail[] {
    return this._sent;
  }

  static get count(): number {
    return this._sent.length;
  }
}

/**
 * Creates a mock email transport that records sends via MockEmailAdapter.
 */
export function createMockEmailTransport() {
  return {
    send(job: QueueEmailJobInput): Promise<{ providerMessageId: string }> {
      const providerMessageId = `mock-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      MockEmailAdapter.record(job, providerMessageId);
      return Promise.resolve({ providerMessageId });
    },
  };
}
