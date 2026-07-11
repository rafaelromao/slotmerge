import { quickAddJob } from "graphile-worker";

import { loadRuntimeConfig } from "../config/runtime";
import type { RuntimeEnv } from "../config/runtime";
import { isSmokeRuntime } from "./smoke";
import {
  localSmokeTaskName,
  storeSmokeJob as defaultStoreSmokeJob,
} from "../worker/smoke";

type EnqueueOptions = {
  env?: RuntimeEnv;
  storeSmokeJob?: (marker: string) => Promise<void>;
  enqueueSmokeJob?: (marker: string) => Promise<void>;
};

export async function createEnqueueSmokeResponse(
  request: Request,
  {
    env = process.env,
    storeSmokeJob = defaultStoreSmokeJob,
    enqueueSmokeJob = enqueueGraphileSmokeJob,
  }: EnqueueOptions = {},
): Promise<Response> {
  const config = loadRuntimeConfig(env);
  if (!isSmokeRuntime(config.appEnv)) {
    return Response.json({ ok: false }, { status: 404 });
  }

  const body = (await request.json()) as { marker?: string };
  const marker: string =
    typeof body.marker === "string"
      ? body.marker
      : `local-smoke-${Date.now()}`;

  await storeSmokeJob(marker);
  await enqueueSmokeJob(marker);

  return Response.json({ ok: true, marker }, { status: 202 });
}

async function enqueueGraphileSmokeJob(marker: string): Promise<void> {
  const config = loadRuntimeConfig();
  await quickAddJob(
    { connectionString: config.databaseUrl },
    localSmokeTaskName,
    { marker },
  );
}
