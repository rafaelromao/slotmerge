import { run } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import { handleLocalSmokeJob, localSmokeTaskName } from "./smoke";

const config = loadRuntimeConfig();

await run({
  connectionString: config.databaseUrl,
  concurrency: 1,
  noHandleSignals: false,
  taskList: {
    [localSmokeTaskName]: async (payload) => handleLocalSmokeJob(payload),
  },
});
