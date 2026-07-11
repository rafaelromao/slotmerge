import type { EmailPayload } from "./service";

type ProductEmailInput = {
  recipient: string;
  payload: EmailPayload;
};

type EmailSender = {
  sendEmail(input: {
    recipient: string;
    type:
      "invite" | "magic-link" | "calendar-action-required" | "admin-critical";
    payload: EmailPayload;
  }): Promise<unknown>;
};

export async function sendInviteEmail(
  service: EmailSender,
  input: ProductEmailInput,
): Promise<unknown> {
  return service.sendEmail({
    recipient: input.recipient,
    type: "invite",
    payload: input.payload,
  });
}

export async function sendMagicLinkEmail(
  service: EmailSender,
  input: ProductEmailInput,
): Promise<unknown> {
  return service.sendEmail({
    recipient: input.recipient,
    type: "magic-link",
    payload: input.payload,
  });
}

export async function sendCalendarActionRequiredEmail(
  service: EmailSender,
  input: ProductEmailInput,
): Promise<unknown> {
  return service.sendEmail({
    recipient: input.recipient,
    type: "calendar-action-required",
    payload: input.payload,
  });
}

export async function sendAdminCriticalEmail(
  service: EmailSender,
  input: ProductEmailInput,
): Promise<unknown> {
  return service.sendEmail({
    recipient: input.recipient,
    type: "admin-critical",
    payload: input.payload,
  });
}
