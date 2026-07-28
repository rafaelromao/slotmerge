import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const DOCUMENT_PATH = "docs/t24-closure-evidence.md";
const AGENTS_PATH = "AGENTS.md";
const AGENTS_CLOSURE_GATE_FIRST_LINE = 51;
const AGENTS_CLOSURE_GATE_LAST_LINE = 66;
const IMPLEMENTATION_GRAPH_PATH = "docs/implementation-graph.md";
const T24_ENTRY_FIRST_LINE = 218;
const T24_ENTRY_LAST_LINE = 222;

interface ClosedTicket {
  t: string;
  issue: number;
  pr: number;
  journey: string;
  vitest: string;
  capture: string;
}

const CLOSED_TICKETS: readonly ClosedTicket[] = [
  {
    t: "T1",
    issue: 287,
    pr: 316,
    journey: "tests/e2e-browser/journeys/user/setup-home.spec.ts",
    vitest: "src/workflow/setup-home.test.ts",
    capture: "tests/e2e-browser/screenshots/setup-home/",
  },
  {
    t: "T2",
    issue: 288,
    pr: 317,
    journey: "tests/e2e-browser/journeys/user/role-guard.spec.ts",
    vitest: "src/auth/page-context.test.ts",
    capture: "n/a",
  },
  {
    t: "T3",
    issue: 289,
    pr: 318,
    journey: "tests/e2e-browser/journeys/user/magic-link.spec.ts",
    vitest: "src/workflow/auth.test.ts",
    capture: "tests/e2e-browser/screenshots/sign-in/",
  },
  {
    t: "T4",
    issue: 290,
    pr: 319,
    journey: "tests/e2e-browser/journeys/user/profile.spec.ts",
    vitest: "src/workflow/profile.test.ts",
    capture: "n/a",
  },
  {
    t: "T5",
    issue: 291,
    pr: 320,
    journey: "tests/e2e-browser/journeys/user/discoverability.spec.ts",
    vitest: "src/workflow/discoverability.test.ts",
    capture: "n/a",
  },
  {
    t: "T6",
    issue: 292,
    pr: 321,
    journey: "tests/e2e-browser/journeys/user/topics.spec.ts",
    vitest: "src/topics/topic-workflow.ts",
    capture: "n/a",
  },
  {
    t: "T7",
    issue: 293,
    pr: 322,
    journey: "tests/e2e-browser/journeys/user/availability.spec.ts",
    vitest: "src/workflow/availability.test.ts",
    capture: "n/a",
  },
  {
    t: "T8",
    issue: 294,
    pr: 324,
    journey: "tests/e2e-browser/journeys/user/calendar-connection.spec.ts",
    vitest: "src/workflow/calendar-connection.test.ts",
    capture: "tests/e2e-browser/screenshots/calendar-connections/",
  },
  {
    t: "T9",
    issue: 295,
    pr: 327,
    journey: "tests/e2e-browser/journeys/user/self-delete.spec.ts",
    vitest: "src/workflow/account.test.ts",
    capture: "tests/e2e-browser/screenshots/self-delete/",
  },
  {
    t: "T11",
    issue: 297,
    pr: 325,
    journey: "tests/e2e-browser/journeys/organizer/search-form.spec.ts",
    vitest: "src/workflow/search.ts",
    capture: "tests/e2e-browser/screenshots/search-form/",
  },
  {
    t: "T12",
    issue: 298,
    pr: 328,
    journey: "tests/e2e-browser/journeys/organizer/search-result.spec.ts",
    vitest: "src/workflow/search.ts",
    capture: "tests/e2e-browser/screenshots/search-result/",
  },
  {
    t: "T13",
    issue: 299,
    pr: 329,
    journey: "tests/e2e-browser/journeys/organizer/search-history.spec.ts",
    vitest: "src/workflow/search.ts",
    capture: "tests/e2e-browser/screenshots/search-history/",
  },
  {
    t: "T14",
    issue: 300,
    pr: 330,
    journey: "tests/e2e-browser/journeys/organizer/api-v1.spec.ts",
    vitest: "src/api/serializers.test.ts",
    capture: "n/a",
  },
  {
    t: "T15",
    issue: 301,
    pr: 331,
    journey: "tests/e2e-browser/journeys/organizer/end-to-end.spec.ts",
    vitest: "src/workflow/search.ts",
    capture: "tests/e2e-browser/screenshots/organizer/",
  },
  {
    t: "T16",
    issue: 302,
    pr: 323,
    journey: "tests/e2e-browser/journeys/admin/users.spec.ts",
    vitest: "src/workflow/admin-users.test.ts",
    capture: "tests/e2e-browser/screenshots/admin/",
  },
  {
    t: "T20",
    issue: 306,
    pr: 313,
    journey: "n/a",
    vitest: "n/a",
    capture: "n/a",
  },
  {
    t: "T21",
    issue: 307,
    pr: 312,
    journey: "n/a",
    vitest: "n/a",
    capture: "n/a",
  },
  {
    t: "T22",
    issue: 308,
    pr: 314,
    journey: "n/a",
    vitest: "n/a",
    capture: "n/a",
  },
  {
    t: "T23",
    issue: 309,
    pr: 315,
    journey: "n/a",
    vitest: "n/a",
    capture: "n/a",
  },
] as const;

function sliceLines(text: string, firstLine: number, lastLine: number): string {
  return text
    .split("\n")
    .slice(firstLine - 1, lastLine)
    .join("\n");
}

function extractFencedBlocks(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length) {
    const openMatch = lines[i]?.match(/^(`{3,}|~{3,})/);
    if (!openMatch) {
      i += 1;
      continue;
    }
    const openMarker = openMatch[1] ?? "";
    const body: string[] = [];
    i += 1;
    while (i < lines.length) {
      const closeMatch = lines[i]?.match(/^(`{3,}|~{3,})\s*$/);
      if (closeMatch && (closeMatch[1]?.length ?? 0) >= openMarker.length) {
        break;
      }
      body.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push(body.join("\n"));
    if (i < lines.length) {
      i += 1;
    }
  }
  return blocks;
}

describe("T24 closure evidence document", () => {
  it("exists at the canonical path with the T24 top-level heading", async () => {
    const document = await readFile(DOCUMENT_PATH, "utf8");

    const headingMatch = document.match(/^# .+$/m);
    expect(headingMatch).not.toBeNull();
    expect(headingMatch?.[0] ?? "").toMatch(/^# T24 closure evidence\b/);
  });

  it("reproduces the AGENTS.md closure-gate set verbatim", async () => {
    const agents = await readFile(AGENTS_PATH, "utf8");
    const agentsClosureGates = sliceLines(
      agents,
      AGENTS_CLOSURE_GATE_FIRST_LINE,
      AGENTS_CLOSURE_GATE_LAST_LINE,
    );
    const document = await readFile(DOCUMENT_PATH, "utf8");
    const fencedBlocks = extractFencedBlocks(document);

    expect(fencedBlocks).toContain(agentsClosureGates);
  });

  it("reproduces the implementation-graph T24 entry verbatim", async () => {
    const graph = await readFile(IMPLEMENTATION_GRAPH_PATH, "utf8");
    const t24Entry = sliceLines(
      graph,
      T24_ENTRY_FIRST_LINE,
      T24_ENTRY_LAST_LINE,
    );
    const document = await readFile(DOCUMENT_PATH, "utf8");
    const fencedBlocks = extractFencedBlocks(document);

    expect(fencedBlocks).toContain(t24Entry);
  });

  it("contains the four subsections from issue #14's Closure Evidence body", async () => {
    const document = await readFile(DOCUMENT_PATH, "utf8");

    for (const heading of [
      "## Screen-level closure (per sub-PRD)",
      "## End-to-end browser journeys",
      "## AGENTS.md acceptance bar",
      "## Implementation-graph T24 parent-PRD closure ticket",
    ]) {
      expect(document).toContain(heading);
    }
  });

  it("publishes a Closed implementation tickets table with the canonical PR mapping", async () => {
    const document = await readFile(DOCUMENT_PATH, "utf8");

    expect(document).toContain("## Closed implementation tickets");

    for (const ticket of CLOSED_TICKETS) {
      const expectedPrUrl = `https://github.com/rafaelromao/slotmerge/pull/${ticket.pr}`;
      expect(
        document,
        `Closed-table row for ${ticket.t} must reference PR #${ticket.pr}`,
      ).toContain(expectedPrUrl);
    }
  });
});
