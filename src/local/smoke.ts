import { loadRuntimeConfig } from "../config/runtime";
import type { RuntimeEnv } from "../config/runtime";
import { checkDatabase as defaultCheckDatabase } from "../db/client";

type HealthOptions = {
  env?: RuntimeEnv;
  checkDatabase?: () => Promise<void>;
};

export async function createHealthResponse({
  env = process.env,
  checkDatabase = defaultCheckDatabase,
}: HealthOptions = {}): Promise<Response> {
  const config = loadRuntimeConfig(env);
  if (!isSmokeRuntime(config.appEnv)) {
    return Response.json({ ok: false }, { status: 404 });
  }

  await checkDatabase();
  return Response.json({ ok: true, web: "ok", database: "ok" });
}

export function isSmokeRuntime(appEnv: string): boolean {
  return appEnv === "local" || appEnv === "test";
}
