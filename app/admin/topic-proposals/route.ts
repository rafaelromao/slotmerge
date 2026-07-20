import { createAdminTopicProposalsHandlers } from "../../../src/admin/topic-proposals";
import { systemDependencies } from "../../../src/system";

const handlers = createAdminTopicProposalsHandlers(systemDependencies());

export const GET = handlers.GET;
export const POST = handlers.POST;
