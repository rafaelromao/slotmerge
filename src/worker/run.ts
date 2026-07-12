import { run } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import { handleLocalSmokeJob, localSmokeTaskName } from "./smoke";
import { emailDeliveryTaskName, handleEmailDeliveryJob } from "./email";
import { calendarSyncTaskName, handleCalendarSyncTask } from "./calendar-sync";
import { reconciliationTaskName, handleReconciliationTask } from "./calendar-reconciliation";

const config = loadRuntimeConfig();

await run({
  connectionString: config.databaseUrl,
  concurrency: 1,
  noHandleSignals: false,
  taskList: {
    [emailDeliveryTaskName]: async (payload) => handleEmailDeliveryJob(payload),
    [localSmokeTaskName]: async (payload) => handleLocalSmokeJob(payload),
    [calendarSyncTaskName]: async (payload) => handleCalendarSyncTask(payload),
    [reconciliationTaskName]: async () => handleReconciliationTask(),
  },
});
