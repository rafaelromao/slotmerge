import { run } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import { createPollCronItems } from "../calendar/poll";
import { systemClock } from "../system/clock";
import { systemRandomSource } from "../system/random";
import { handleLocalSmokeJob, localSmokeTaskName } from "./smoke";
import { emailDeliveryTaskName, handleEmailDeliveryJob } from "./email";
import {
  handleSyncCalendarConnectionJob,
  syncCalendarConnectionTaskName,
} from "./sync";
import {
  handlePollCalendarConnectionsJob,
  pollCalendarConnectionsTaskName,
} from "./poll";

const config = loadRuntimeConfig();

const pollCronExpression =
  config.appEnv === "local" || config.appEnv === "test"
    ? "*/5 * * * *"
    : "*/15 * * * *";

const pollCronItems = createPollCronItems(pollCronExpression);

const clock = systemClock();
const randomSource = systemRandomSource();

await run(
  {
    connectionString: config.databaseUrl,
    concurrency: 1,
    noHandleSignals: false,
    parsedCronItems: pollCronItems,
  },
  {
    [emailDeliveryTaskName]: async (payload) =>
      handleEmailDeliveryJob(payload, { clock }),
    [localSmokeTaskName]: async (payload) => handleLocalSmokeJob(payload),
    [syncCalendarConnectionTaskName]: async (payload) =>
      handleSyncCalendarConnectionJob(payload, { clock, randomSource }),
    [pollCalendarConnectionsTaskName]: async (payload) =>
      handlePollCalendarConnectionsJob(payload, { clock, randomSource }),
  },
);
