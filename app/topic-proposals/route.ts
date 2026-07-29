import { createTopicProposalsHandlers } from "../../src/topics/proposals-route";
import { systemClock } from "../../src/system/clock";

const handlers = createTopicProposalsHandlers({ clock: systemClock() });

export const POST = (request: Request) => handlers.POST(request);
