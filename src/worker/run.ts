import { run } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import { createPollCronItems } from "../calendar/poll";
import { handleLocalSmokeJob, localSmokeTaskName } from "./smoke";
import { emailDeliveryTaskName, handleEmailDeliveryJob } from "./email";
import {
  handleSyncCalendarConnectionJob,
  syncCalendarConnectionTaskName,
} from "./sync";
import { handlePollCalendarConnectionsJob, pollCalendarConnectionsTaskName } from "./poll";

const config = loadRuntimeConfig();

const pollCronExpression =
  config.appEnv === "local" || config.appEnv === "test"
    ? "*/5 * * * *"
    : "*/15 * * * *";

const pollCronItems = createPollCronItems(pollCronExpression);

await run(
  {
    connectionString: config.databaseUrl,
    concurrency: 1,
    noHandleSignals: false,
    parsedCronItems: pollCronItems,
  },
  {
    [emailDeliveryTaskName]: async (payload) => handleEmailDeliveryJob(payload),
    [localSmokeTaskName]: async (payload) => handleLocalSmokeJob(payload),
    [syncCalendarConnectionTaskName]: async (payload) =>
      handleSyncCalendarConnectionJob(payload),
    [pollCalendarConnectionsTaskName]: async () =>
      handlePollCalendarConnectionsJob(),
  },
);
