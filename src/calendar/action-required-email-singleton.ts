import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import { createPostgresEmailEventRepository } from "../email/repository";
import {
  createEmailDeliveryService,
  type EmailDeliveryService,
} from "../email/service";
import { getConnectionActionRequiredDispatchLookup } from "./action-required-email.repository";
import {
  triggerCalendarActionRequiredEmail,
  type CalendarActionRequiredReason,
  type TriggerCalendarActionRequiredEmailDeps,
  type TriggerCalendarActionRequiredEmailInput,
  type TriggerCalendarActionRequiredEmailResult,
} from "./action-required-email";

let emailDeliveryServiceOverride: EmailDeliveryService | null = null;

export function setEmailDeliveryServiceForTests(
  service: EmailDeliveryService | null,
) {
  emailDeliveryServiceOverride = service;
}

export function getEmailDeliveryService(): EmailDeliveryService {
  if (emailDeliveryServiceOverride) {
    return emailDeliveryServiceOverride;
  }
  if (!defaultEmailDeliveryService) {
    defaultEmailDeliveryService = createDefaultEmailDeliveryService();
  }
  return defaultEmailDeliveryService;
}

let defaultEmailDeliveryService: EmailDeliveryService | null = null;

function createDefaultEmailDeliveryService(): EmailDeliveryService {
  const config = loadRuntimeConfig();
  const eventRepository = createPostgresEmailEventRepository();
  return createEmailDeliveryService({
    eventRepository,
    queueJob: (queued) => enqueueCalendarActionRequiredJob(queued, config.databaseUrl),
  });
}

async function enqueueCalendarActionRequiredJob(
  job: Parameters<EmailDeliveryService["sendEmail"]>[0] extends never
    ? never
    : {
        emailEventId: string;
        recipient: string;
        type: string;
        payload: Record<string, unknown>;
      },
  databaseUrl: string,
): Promise<void> {
  await quickAddJob({ connectionString: databaseUrl }, "deliver_email", {
    emailEventId: job.emailEventId,
    recipient: job.recipient,
    type: job.type,
    payload: job.payload,
  });
}

export type CalendarActionRequiredEmailTrigger = (
  input: TriggerCalendarActionRequiredEmailInput,
) => Promise<TriggerCalendarActionRequiredEmailResult>;

export function createCalendarActionRequiredEmailTrigger(
  partial: Partial<TriggerCalendarActionRequiredEmailDeps> = {},
): CalendarActionRequiredEmailTrigger {
  return async (input) =>
    triggerCalendarActionRequiredEmail(input, {
      emailDeliveryService: getEmailDeliveryService(),
      lastDispatchLookup: getConnectionActionRequiredDispatchLookup(),
      ...partial,
    });
}

export type { CalendarActionRequiredReason };