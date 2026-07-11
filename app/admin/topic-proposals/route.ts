import { createAdminTopicProposalsHandlers } from "../../../src/admin/topic-proposals";

const handlers = createAdminTopicProposalsHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
