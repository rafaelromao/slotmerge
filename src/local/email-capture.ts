export type CapturedEmail = {
  recipient: string;
  type: string;
  payload: Record<string, unknown>;
  capturedAt: string;
};

const capturedEmails = new Map<string, CapturedEmail[]>();

export function captureEmail(email: CapturedEmail): void {
  const existing = capturedEmails.get(email.recipient) ?? [];
  existing.push(email);
  capturedEmails.set(email.recipient, existing);
}

export function getCapturedEmailsForRecipient(
  recipient: string,
): CapturedEmail[] {
  return capturedEmails.get(recipient) ?? [];
}

export function getLastMagicLinkUrlForRecipient(
  recipient: string,
): string | null {
  const emails = getCapturedEmailsForRecipient(recipient);
  const magicLinkEmails = emails.filter((e) => e.type === "magic-link");
  if (magicLinkEmails.length === 0) {
    return null;
  }
  const lastMagicLinkEmail = magicLinkEmails[magicLinkEmails.length - 1];
  const url = lastMagicLinkEmail.payload["magicLinkUrl"];
  return typeof url === "string" ? url : null;
}

export function resetCapturedEmails(): void {
  capturedEmails.clear();
}
