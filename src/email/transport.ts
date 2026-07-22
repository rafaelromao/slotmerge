import nodemailer from "nodemailer";

import { captureEmail } from "../local/email-capture";
import type { QueueEmailJobInput } from "./service";

type EmailTransportOptions = {
  adapter: "mock" | "postmark";
  env?: typeof process.env;
};

export function createEmailTransport({
  adapter,
  env = process.env,
}: EmailTransportOptions): EmailTransport {
  if (adapter === "mock") {
    return {
      send(job: QueueEmailJobInput) {
        const shouldCapture =
          (env.APP_ENV === "local" || env.APP_ENV === "test") &&
          env.EMAIL_CAPTURE_ENABLED === "true";

        if (shouldCapture) {
          captureEmail({
            recipient: job.recipient,
            type: job.type,
            payload: job.payload,
            capturedAt: new Date().toISOString(),
          });

          const baseUrl = env.LOCAL_WEB_URL ?? "http://localhost:3000";
          fetch(`${baseUrl}/api/local/emails/capture`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipient: job.recipient,
              type: job.type,
              payload: job.payload,
              capturedAt: new Date().toISOString(),
            }),
          }).catch(() => {});
        }

        return Promise.resolve({
          providerMessageId: `mock-${job.emailEventId}`,
        });
      },
    };
  }

  return createPostmarkTransport(env);
}

type EmailTransport = {
  send(job: QueueEmailJobInput): Promise<{ providerMessageId: string }>;
};

function createPostmarkTransport(env: typeof process.env): EmailTransport {
  const serverToken = env.POSTMARK_SERVER_TOKEN;
  if (!serverToken) {
    throw new Error("POSTMARK_SERVER_TOKEN is required for email delivery");
  }

  const transport = nodemailer.createTransport({
    host: "smtp.postmarkapp.com",
    port: 587,
    secure: false,
    auth: {
      user: serverToken,
      pass: serverToken,
    },
  });

  return {
    send(job: QueueEmailJobInput) {
      return transport
        .sendMail({
          from: env.EMAIL_FROM ?? "SlotMerge <no-reply@slotmerge.local>",
          to: job.recipient,
          subject: subjectForEmailType(job.type),
          text: bodyForEmailJob(job),
        })
        .then((info: { messageId: string }) => ({
          providerMessageId: info.messageId,
        }));
    },
  };
}

function subjectForEmailType(type: QueueEmailJobInput["type"]): string {
  switch (type) {
    case "invite":
      return "You're invited to SlotMerge";
    case "magic-link":
      return "Your SlotMerge magic link";
    case "calendar-action-required":
      return "SlotMerge calendar action required";
    case "admin-critical":
      return "SlotMerge admin alert";
    default:
      throw new Error(`unsupported email type: ${String(type)}`);
  }
}

function bodyForEmailJob(job: QueueEmailJobInput): string {
  return [
    `Type: ${job.type}`,
    `Recipient: ${job.recipient}`,
    "",
    JSON.stringify(job.payload, null, 2),
  ].join("\n");
}
