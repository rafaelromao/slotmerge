import { createTopicProposalsHandlers } from "../../src/topics/proposals-route";

const handlers = createTopicProposalsHandlers();

export const POST = (request: Request) => handlers.POST(request);
