import { run } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import { handleLocalSmokeJob, localSmokeTaskName } from "./smoke";
import { emailDeliveryTaskName, handleEmailDeliveryJob } from "./email";
import {
  handleSyncCalendarConnectionJob,
  syncCalendarConnectionTaskName,
} from "../calendar/sync-handler";
import {
  syncCalendarConnectionTaskName as syncTaskName,
  reconcileCalendarConnectionsTaskName,
} from "../calendar/sync-jobs";

const config = loadRuntimeConfig();

await run({
  connectionString: config.databaseUrl,
  concurrency: 1,
  noHandleSignals: false,
  taskList: {
    [emailDeliveryTaskName]: async (payload) => handleEmailDeliveryJob(payload),
    [localSmokeTaskName]: async (payload) => handleLocalSmokeJob(payload),
    [syncTaskName]: async (payload) => handleSyncCalendarConnectionJob(payload),
  },
});
