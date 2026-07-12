import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import type { QueueEmailJobInput } from "./service";

export async function enqueueInviteEmailJob(
  job: QueueEmailJobInput,
): Promise<void> {
  const config = loadRuntimeConfig();
  await quickAddJob(
    { connectionString: config.databaseUrl },
    "deliver_email",
    job,
  );
}
