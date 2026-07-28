import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const OUT = "/tmp/opencode/slotmerge-polish";

type Role = "public" | "user" | "organizer" | "admin";
type Theme = "light" | "dark";
type Surface = {
  id: string;
  role: Role;
  url: string;
};

const SURFACES: Surface[] = [
  { id: "public-sign-in", role: "public", url: `${BASE}/sign-in` },
  {
    id: "public-sign-in-sent",
    role: "public",
    url: `${BASE}/sign-in/sent?email=t%2A%40example.com&localEmail=test%40example.com`,
  },
  {
    id: "public-sign-in-verify",
    role: "public",
    url: `${BASE}/sign-in/verify?token=demo`,
  },
  { id: "user-home", role: "user", url: `${BASE}/` },
  { id: "user-profile", role: "user", url: `${BASE}/me` },
  { id: "user-discoverability", role: "user", url: `${BASE}/me/discoverability` },
  { id: "user-topics", role: "user", url: `${BASE}/me/topics` },
  { id: "user-availability", role: "user", url: `${BASE}/me/availability` },
  { id: "user-calendar-connections", role: "user", url: `${BASE}/me/calendar-connections` },
  { id: "organizer-home", role: "organizer", url: `${BASE}/` },
  { id: "organizer-searches", role: "organizer", url: `${BASE}/searches` },
  { id: "organizer-searches-history", role: "organizer", url: `${BASE}/searches/history` },
  { id: "admin-home", role: "admin", url: `${BASE}/admin` },
  { id: "admin-users", role: "admin", url: `${BASE}/admin#users` },
  { id: "admin-topics", role: "admin", url: `${BASE}/admin#topics` },
  { id: "admin-status", role: "admin", url: `${BASE}/admin#status` },
];

const STORAGE = "/home/romao/projects/slotmerge-issue-339/playwright/.auth";

function storageStateFor(role: Role): string | undefined {
  if (role === "public") return undefined;
  return join(STORAGE, `${role}.json`);
}

type StorageStateShape = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

async function loadStorage(role: Role): Promise<StorageStateShape | undefined> {
  const file = storageStateFor(role);
  if (!file) return undefined;
  const raw = await import("node:fs").then((m) => m.promises.readFile(file, "utf8"));
  const parsed = JSON.parse(raw) as StorageStateShape;
  parsed.origins = parsed.origins.map((origin) => ({
    ...origin,
    origin: "http://localhost:3002",
  }));
  return parsed;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const themes: Theme[] = ["light", "dark"];
  const viewports: { label: string; width: number; height: number }[] = [
    { label: "desktop", width: 1440, height: 900 },
    { label: "mobile", width: 390, height: 844 },
  ];
  const summary: string[] = [];

  for (const viewport of viewports) {
    for (const theme of themes) {
      for (const surface of SURFACES) {
        const storage = await loadStorage(surface.role);
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          ...(storage ? { storageState: storage } : {}),
        });
        await context.addInitScript((value: string) => {
          try {
            window.localStorage.setItem("slotmerge-theme", value);
          } catch {
            /* storage unavailable */
          }
        }, theme);
        const page = await context.newPage();
        try {
          const filename = `${theme}-${viewport.label}-${surface.id}.png`;
          await page.goto(surface.url, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
          await page.waitForTimeout(400);
          await page.screenshot({ path: join(OUT, filename), fullPage: true });
          summary.push(`OK ${viewport.label} ${theme} ${surface.id}`);
        } catch (error) {
          summary.push(`ERR ${viewport.label} ${theme} ${surface.id} ${(error as Error).message}`);
        } finally {
          await page.close();
          await context.close();
        }
      }
    }
  }

  await browser.close();
  writeFileSync(join(OUT, "summary.txt"), summary.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});