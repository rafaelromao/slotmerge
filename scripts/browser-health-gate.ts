import { spawn } from "node:child_process";

const HEALTH_URL =
  process.env.LOCAL_WEB_URL ?? "http://localhost:3000/api/local/health";
const TIMEOUT_MS = Number(process.env.BROWSER_HEALTH_TIMEOUT_MS ?? 10_000);

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError: string | null = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH_URL);
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Browser harness health gate timed out after ${TIMEOUT_MS}ms waiting for ${HEALTH_URL}` +
      (lastError ? `: ${lastError}` : ""),
  );
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
          new Error(`${command} ${args.join(" ")} exited with code ${code}`),
        );
      }
    });
  });
}

async function main(): Promise<void> {
  await waitForHealth();
  const [, , ...rest] = process.argv;
  if (rest.length === 0) {
    throw new Error(
      "usage: tsx scripts/browser-health-gate.ts <command> [args...]",
    );
  }
  await runCommand(rest[0], rest.slice(1));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
