import { createMagicLinkRequestHandlers } from "../../../../src/auth/magic-link-request";
import { createEmailDeliveryService } from "../../../../src/email/service";
import { createPostgresEmailEventRepository } from "../../../../src/email/repository";
import { enqueueInviteEmailJob } from "../../../../src/email/invite-jobs";
import { loadRuntimeConfig } from "../../../../src/config/runtime";

const handlers = createMagicLinkRequestHandlers({
  emailDeliveryService: createEmailDeliveryService({
    eventRepository: createPostgresEmailEventRepository(),
    queueJob: (job) => enqueueInviteEmailJob(job),
  }),
  baseUrl: loadRuntimeConfig().appBaseUrl,
});

export const POST = handlers.POST;
