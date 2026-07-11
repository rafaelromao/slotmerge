import { getPool } from "../db/client";

export const localSmokeTaskName = "local_smoke";

type SmokePayload = {
  marker: string;
};

type SmokeJobDependencies = {
  markProcessed?: (marker: string) => Promise<void>;
};

export async function handleLocalSmokeJob(
  payload: unknown,
  { markProcessed = markSmokeJobProcessed }: SmokeJobDependencies = {},
): Promise<void> {
  const smokePayload = parseSmokePayload(payload);
  await markProcessed(smokePayload.marker);
}

export async function storeSmokeJob(marker: string): Promise<void> {
  await getPool().query("insert into local_smoke_jobs (marker) values ($1)", [
    marker,
  ]);
}

export async function markSmokeJobProcessed(marker: string): Promise<void> {
  await getPool().query(
    "update local_smoke_jobs set processed = true, processed_at = now() where marker = $1",
    [marker],
  );
}

export async function isSmokeJobProcessed(marker: string): Promise<boolean> {
  const result = await getPool().query<{ processed: boolean }>(
    "select processed from local_smoke_jobs where marker = $1",
    [marker],
  );
  return result.rows[0]?.processed === true;
}

function parseSmokePayload(payload: unknown): SmokePayload {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "marker" in payload &&
    typeof payload.marker === "string"
  ) {
    return { marker: payload.marker };
  }
  throw new Error("local smoke job requires a marker payload");
}
