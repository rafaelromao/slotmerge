import { spawn } from "node:child_process";

import { loadRuntimeConfig } from "../src/config/runtime";
import type { RuntimeEnv } from "../src/config/runtime";
import { isSmokeJobProcessed } from "../src/worker/smoke";

type MigrationCheck = { applied: true };
type WebCheck = { ok: true };
type WorkerCheck = { ok: true; marker: string };

export type LocalVerificationResult = {
  ok: true;
  checks: {
    config: "ok";
    migrations: "ok";
    web: "ok";
    worker: "ok";
  };
};

export type LocalVerificationDependencies = {
  env?: RuntimeEnv;
  applyMigrations?: () => Promise<MigrationCheck>;
  checkWebHealth?: () => Promise<WebCheck>;
  processSmokeJob?: () => Promise<WorkerCheck>;
};

export async function runLocalVerification({
  env = process.env,
  applyMigrations = runDrizzleMigrations,
  checkWebHealth = fetchWebHealth,
  processSmokeJob = requestSmokeJobProcessing,
}: LocalVerificationDependencies = {}): Promise<LocalVerificationResult> {
  loadRuntimeConfig(env);
  await applyMigrations();
  await checkWebHealth();
  await processSmokeJob();

  return {
    ok: true,
    checks: {
      config: "ok",
      migrations: "ok",
      web: "ok",
      worker: "ok",
    },
  };
}

async function runDrizzleMigrations(): Promise<MigrationCheck> {
  await runCommand("pnpm", ["exec", "drizzle-kit", "migrate"]);
  return { applied: true };
}

async function fetchWebHealth(): Promise<WebCheck> {
  const baseUrl = process.env.LOCAL_WEB_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(`${baseUrl}/api/local/health`);
  if (!response.ok) {
    throw new Error(`web health check failed with HTTP ${response.status}`);
  }
  return { ok: true };
}

async function requestSmokeJobProcessing(): Promise<WorkerCheck> {
  const baseUrl = process.env.LOCAL_WEB_URL ?? "http://127.0.0.1:3000";
  const marker = `local-smoke-${Date.now()}`;
  const response = await fetch(`${baseUrl}/api/local/enqueue-smoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ marker }),
  });
  if (!response.ok) {
    throw new Error(`worker smoke enqueue failed with HTTP ${response.status}`);
  }
  await waitForSmokeJob(marker);
  return { ok: true, marker };
}

async function waitForSmokeJob(marker: string): Promise<void> {
  const deadline =
    Date.now() + Number(process.env.LOCAL_VERIFY_TIMEOUT_MS ?? 15_000);
  while (Date.now() < deadline) {
    if (await isSmokeJobProcessed(marker)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`smoke job was not processed: ${marker}`);
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} exited with ${code ?? "unknown status"}`,
          ),
        );
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLocalVerification()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
