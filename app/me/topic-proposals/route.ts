import { createMeTopicProposalsHandlers } from "../../../src/topics/me-topic-proposals-route";

const handlers = createMeTopicProposalsHandlers();

export const GET = (request: Request) => handlers.GET(request);
