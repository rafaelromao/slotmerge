import nodemailer from "nodemailer";

import type { RuntimeEnv } from "../config/runtime";
import type { EmailTransport, QueueEmailJobInput } from "./service";

type EmailTransportOptions = {
  adapter: "mock" | "postmark";
  env?: RuntimeEnv;
};

export function createEmailTransport({
  adapter,
  env = process.env,
}: EmailTransportOptions): EmailTransport {
  if (adapter === "mock") {
    return {
      send(job: QueueEmailJobInput) {
        return Promise.resolve({
          providerMessageId: `mock-${job.emailEventId}`,
        });
      },
    };
  }

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
        .then((info) => ({ providerMessageId: info.messageId }));
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
