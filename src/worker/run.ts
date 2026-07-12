import { run } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import { handleLocalSmokeJob, localSmokeTaskName } from "./smoke";
import { emailDeliveryTaskName, handleEmailDeliveryJob } from "./email";
import {
  calendarConnectionReconcileTaskName,
  calendarConnectionSyncTaskName,
  handleCalendarConnectionReconcileJob,
  handleCalendarConnectionSyncJob,
} from "./calendar-sync";

const config = loadRuntimeConfig();

await run({
  connectionString: config.databaseUrl,
  concurrency: 1,
  noHandleSignals: false,
  taskList: {
    [calendarConnectionReconcileTaskName]: async (payload) =>
      handleCalendarConnectionReconcileJob(payload),
    [calendarConnectionSyncTaskName]: async (payload) =>
      handleCalendarConnectionSyncJob(payload),
    [emailDeliveryTaskName]: async (payload) => handleEmailDeliveryJob(payload),
    [localSmokeTaskName]: async (payload) => handleLocalSmokeJob(payload),
  },
});
