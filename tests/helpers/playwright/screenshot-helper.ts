import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "@playwright/test";

export type ScreenName = string;
export type StateName = string;

export async function captureState(
  page: Page,
  screen: ScreenName,
  state: StateName,
): Promise<void> {
  if (process.env.CAPTURE !== "true") {
    return;
  }
  const screenshotsDir = path.join(
    process.cwd(),
    "tests",
    "e2e-browser",
    "screenshots",
    screen,
  );
  await mkdir(screenshotsDir, { recursive: true });
  const screenshotPath = path.join(screenshotsDir, `${state}.png`);
  const screenshot = await page.screenshot({ fullPage: true });
  await writeFile(screenshotPath, screenshot);
}
