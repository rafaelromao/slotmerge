import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const DOCUMENT_PATH = "docs/t25-sub-prd-closure-evidence.md";
const AGENTS_PATH = "AGENTS.md";

const expectedScopes = [
  ["#15", "T10–T15", "searchWorkflow", "Blocked by T10 (#296)"],
  ["#16", "T3", "authWorkflow", "Eligible"],
  ["#17", "T8", "calendarConnectionWorkflow", "Eligible"],
  [
    "#18",
    "T16–T19",
    "adminUsersWorkflow",
    "Blocked by T17 (#303), T18 (#304), T19 (#305)",
  ],
  ["#19", "T4, T5, T6, T7, T9", "profileWorkflow", "Eligible"],
] as const;

function sliceLines(text: string, firstLine: number, lastLine: number): string {
  return text
    .split("\n")
    .slice(firstLine - 1, lastLine)
    .join("\n");
}

describe("T25 sub-PRD closure evidence", () => {
  it("reproduces the AGENTS.md closure gates exactly", async () => {
    const [document, agents] = await Promise.all([
      readFile(DOCUMENT_PATH, "utf8"),
      readFile(AGENTS_PATH, "utf8"),
    ]);
    const expected = sliceLines(agents, 51, 66);
    const start = document.indexOf(
      "  - **Rendered-screen and browser-journey completion gates**",
    );
    const end = document.indexOf("\n```", start);
    expect(document.slice(start, end)).toBe(expected);
  });

  it("records every scoped sub-PRD and its canonical workflow", async () => {
    const document = await readFile(DOCUMENT_PATH, "utf8");
    for (const [prd, tickets, workflow, status] of expectedScopes) {
      expect(document).toContain(`| ${prd}`);
      expect(document).toContain(tickets);
      expect(document).toContain(`\`${workflow}\``);
      expect(document).toContain(status);
    }
  });

  it("records live blockers instead of claiming blocked closures", async () => {
    const document = await readFile(DOCUMENT_PATH, "utf8");
    expect(document).toContain("T10 (#296)");
    expect(document).toContain("T17 (#303), T18 (#304), T19 (#305)");
    expect(document).toContain("blocked issues remain open");
  });

  it("requires human sign-off in every closing template", async () => {
    const document = await readFile(DOCUMENT_PATH, "utf8");
    const signoff =
      "Human reviewer sign-off: approved on the current T25 change-request diff (see PR review).";
    expect(document).toContain(signoff);
    expect(document.match(/Human reviewer sign-off:/g)).toHaveLength(1);
    for (const prd of ["#15:", "#16:", "#17:", "#18:", "#19:"]) {
      expect(document).toContain(`- ${prd}`);
    }
  });

  it("preserves the locked PR-CI gate and closing reference", async () => {
    const document = await readFile(DOCUMENT_PATH, "utf8");
    expect(document).toContain("`Closes #311`");
    expect(document).toContain(
      "pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build",
    );
    expect(document).toContain("workflow-dispatch-only");
  });
});
