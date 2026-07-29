import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "http://localhost:3002";
const STORAGE = "/home/romao/projects/slotmerge-issue-339/playwright/.auth";
const OUT = "/tmp/opencode/slotmerge-polish";

type Role = "public" | "user" | "organizer" | "admin";
type Theme = "light" | "dark";
type Viewport = { label: string; width: number; height: number };
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
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
  }[];
};

type Surface = {
  id: string;
  role: Role;
  url: string;
  expandSection?: string;
};

const BASE_SURFACES: Surface[] = [
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
  {
    id: "user-discoverability",
    role: "user",
    url: `${BASE}/me/discoverability`,
  },
  { id: "user-topics", role: "user", url: `${BASE}/me/topics` },
  { id: "user-availability", role: "user", url: `${BASE}/me/availability` },
  {
    id: "user-calendar-connections",
    role: "user",
    url: `${BASE}/me/calendar-connections`,
  },
  { id: "organizer-home", role: "organizer", url: `${BASE}/` },
  { id: "organizer-searches", role: "organizer", url: `${BASE}/searches` },
  {
    id: "organizer-searches-history",
    role: "organizer",
    url: `${BASE}/searches/history`,
  },
  {
    id: "organizer-search-result",
    role: "organizer",
    url: `${BASE}/searches/74a5c49d-fa62-4c99-8508-b65a227ea190?week=2026-07-13`,
  },
  { id: "admin-home", role: "admin", url: `${BASE}/admin` },
  { id: "admin-users", role: "admin", url: `${BASE}/admin#users` },
  {
    id: "admin-users-expanded",
    role: "admin",
    url: `${BASE}/admin#users`,
    expandSection: "users",
  },
  { id: "admin-topics", role: "admin", url: `${BASE}/admin#topics` },
  {
    id: "admin-topics-expanded",
    role: "admin",
    url: `${BASE}/admin#topics`,
    expandSection: "topics",
  },
  { id: "admin-status", role: "admin", url: `${BASE}/admin#status` },
  {
    id: "admin-status-expanded",
    role: "admin",
    url: `${BASE}/admin#status`,
    expandSection: "status",
  },
  { id: "user-profile-edit", role: "user", url: `${BASE}/me/profile` },
];

function storageStateFor(role: Role): string | undefined {
  if (role === "public") return undefined;
  return join(STORAGE, `${role}.json`);
}

async function loadStorage(role: Role): Promise<StorageStateShape | undefined> {
  const file = storageStateFor(role);
  if (!file) return undefined;
  const fs = await import("node:fs");
  const raw = await fs.promises.readFile(file, "utf8");
  const parsed = JSON.parse(raw) as StorageStateShape;
  parsed.origins = parsed.origins.map((origin) => ({
    ...origin,
    origin: "http://localhost:3002",
  }));
  return parsed;
}

async function captureWith(
  browser: import("playwright").Browser,
  opts: {
    surface: Surface;
    viewport: Viewport;
    theme: Theme;
    summary: string[];
    expand?: { section: string };
  },
) {
  const { surface, viewport, theme, expand } = opts;
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
    await page.goto(surface.url, { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 15000 })
      .catch(() => undefined);
    if (surface.id === "organizer-search-result") {
      const link = page.locator('a[href*="/searches/"]').first();
      const href = await link.getAttribute("href");
      if (href) {
        await page.goto(new URL(href, BASE).toString(), {
          waitUntil: "domcontentloaded",
        });
        await page
          .waitForLoadState("networkidle", { timeout: 15000 })
          .catch(() => undefined);
      }
    }
    if (expand) {
      await page.locator(`#${expand.section}`).evaluate((el) => {
        if (el && "open" in el && !el.open) {
          (el as HTMLDetailsElement).open = true;
        }
      });
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(400);
    const filename = `${theme}-${viewport.label}-${surface.id}.png`;
    await page.screenshot({ path: join(OUT, filename), fullPage: true });
    opts.summary.push(`OK ${viewport.label} ${theme} ${surface.id}`);
  } catch (error) {
    opts.summary.push(
      `ERR ${viewport.label} ${theme} ${surface.id} ${(error as Error).message}`,
    );
  } finally {
    await page.close();
    await context.close();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const themes: Theme[] = ["light", "dark"];
  const viewports: Viewport[] = [
    { label: "desktop", width: 1440, height: 900 },
    { label: "mobile", width: 390, height: 844 },
  ];
  const summary: string[] = [];

  for (const viewport of viewports) {
    for (const theme of themes) {
      for (const surface of BASE_SURFACES) {
        await captureWith(browser, {
          surface,
          viewport,
          theme,
          summary,
          expand: surface.expandSection
            ? { section: surface.expandSection }
            : undefined,
        });
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
