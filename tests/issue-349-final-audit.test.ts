import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const AUDIT_DOCUMENT_PATH = "docs/issue-349-final-audit.md";
const ACCEPTANCE_RUNS_DOCUMENT_PATH = "docs/t349-acceptance-runs.md";
const AGENTS_PATH = "AGENTS.md";
const T24_DOCUMENT_PATH = "docs/t24-closure-evidence.md";
const T25_DOCUMENT_PATH = "docs/t25-sub-prd-closure-evidence.md";
const CLOSURE_EVIDENCE_REPAIR_PATH = "docs/closure-evidence-repair.md";
const T348_ACCEPTANCE_SUMMARY_PATH = "docs/t348-acceptance-summary.md";

interface TargetIssue {
  readonly id: string;
  readonly issue: number;
  readonly title: string;
  readonly rowHeading: string;
  readonly prs: readonly number[];
  readonly closureCommentUrl: string;
}

const TARGET_ISSUES: readonly TargetIssue[] = [
  {
    id: "I1",
    issue: 14,
    title: "SlotMerge MVP PRD",
    rowHeading:
      "[#14](https://github.com/rafaelromao/slotmerge/issues/14) | SlotMerge MVP PRD",
    prs: [],
    closureCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/14#issuecomment-5121222111",
  },
  {
    id: "I2",
    issue: 18,
    title: "Sub-PRD: Admin & Notifications",
    rowHeading:
      "[#18](https://github.com/rafaelromao/slotmerge/issues/18) | Sub-PRD: Admin & Notifications",
    prs: [],
    closureCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/18#issuecomment-5121226061",
  },
  {
    id: "I3",
    issue: 62,
    title: "E2E test plan: SlotMerge MVP",
    rowHeading:
      "[#62](https://github.com/rafaelromao/slotmerge/issues/62) | E2E test plan: SlotMerge MVP",
    prs: [],
    closureCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/62#issuecomment-5121231079",
  },
  {
    id: "I4",
    issue: 283,
    title: "Wayfinder: foundation",
    rowHeading:
      "[#283](https://github.com/rafaelromao/slotmerge/issues/283) | Wayfinder: foundation",
    prs: [316, 317, 313, 312, 314, 315],
    closureCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/283#issuecomment-5121233820",
  },
  {
    id: "I5",
    issue: 284,
    title: "Wayfinder: User journey",
    rowHeading:
      "[#284](https://github.com/rafaelromao/slotmerge/issues/284) | Wayfinder: User journey",
    prs: [318, 319, 320, 321, 322, 324, 327, 332],
    closureCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/284#issuecomment-5121237774",
  },
  {
    id: "I6",
    issue: 285,
    title: "Wayfinder: Organizer journey",
    rowHeading:
      "[#285](https://github.com/rafaelromao/slotmerge/issues/285) | Wayfinder: Organizer journey",
    prs: [325, 328, 329, 330, 331],
    closureCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/285#issuecomment-5121240628",
  },
  {
    id: "I7",
    issue: 286,
    title: "Wayfinder: Admin journey",
    rowHeading:
      "[#286](https://github.com/rafaelromao/slotmerge/issues/286) | Wayfinder: Admin journey",
    prs: [323, 336, 334, 337],
    closureCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/286#issuecomment-5121244133",
  },
];

async function readAuditDocument(): Promise<string> {
  return readFile(AUDIT_DOCUMENT_PATH, "utf8");
}

async function readAcceptanceRunsDocument(): Promise<string> {
  return readFile(ACCEPTANCE_RUNS_DOCUMENT_PATH, "utf8");
}

describe("Issue #349 final audit", () => {
  it("lands the audit document and the acceptance-runs document", async () => {
    const [audit, runs] = await Promise.all([
      readAuditDocument(),
      readAcceptanceRunsDocument(),
    ]);

    expect(audit).toContain("# Issue #349 — Final audit of journey maps and PRDs");
    expect(runs).toContain("# Final browser and visual acceptance runs");
  });

  it("contains every mandatory top-level section", async () => {
    const document = await readAuditDocument();

    for (const heading of [
      "## Scope",
      "## Audit window",
      "## Final acceptance runs",
      "## Per-issue verification matrix",
      "## Per-issue evidence — closure-evidence contract",
      "## Visual capture inventory at the audit window",
      "## Missing-screenshot / stale-summary audit",
      "## PR-CI gate",
      "## Reproduction",
    ]) {
      expect(
        document,
        `audit document must contain the "${heading}" section`,
      ).toContain(heading);
    }
  });

  it("names AGENTS.md as the source of the closure-gate language", async () => {
    const document = await readAuditDocument();

    expect(document).toContain("AGENTS.md");
    expect(document).toContain("lines 51");
    expect(document).toContain("Rendered-screen and browser-journey completion gates");
  });

  it("names the seven target issues from issue #349", async () => {
    const document = await readAuditDocument();

    for (const issue of TARGET_ISSUES) {
      expect(
        document,
        `audit document must reference issue #${issue.issue}`,
      ).toContain(`issues/${issue.issue}`);
    }
  });

  it("records a per-issue row for every target issue", async () => {
    const document = await readAuditDocument();

    for (const issue of TARGET_ISSUES) {
      expect(
        document,
        `audit document must contain a per-issue row for issue #${issue.issue}`,
      ).toContain(issue.rowHeading);
    }
  });

  it("closes each target issue with a Close decision (no remain-open findings)", async () => {
    const document = await readAuditDocument();

    const tableStart = document.indexOf("## Per-issue verification matrix");
    const tableEnd = document.indexOf("## Per-issue evidence — closure-evidence contract");
    expect(tableStart).toBeGreaterThan(-1);
    expect(tableEnd).toBeGreaterThan(tableStart);

    const table = document.slice(tableStart, tableEnd);
    for (const issue of TARGET_ISSUES) {
      const rowStart = table.indexOf(issue.rowHeading);
      expect(
        rowStart,
        `verification matrix must include row for issue #${issue.issue}`,
      ).toBeGreaterThan(-1);
      const rowEnd = table.indexOf("\n| ", rowStart + issue.rowHeading.length);
      const row = table.slice(
        rowStart,
        rowEnd === -1 ? table.length : rowEnd,
      );
      expect(
        row,
        `issue #${issue.issue} must record a Close decision`,
      ).toMatch(/\*\*Close\*\*/);
    }
  });

  it("references the canonical closure-evidence documents", async () => {
    const [audit, t24, t25, repair] = await Promise.all([
      readAuditDocument(),
      readFile(T24_DOCUMENT_PATH, "utf8"),
      readFile(T25_DOCUMENT_PATH, "utf8"),
      readFile(CLOSURE_EVIDENCE_REPAIR_PATH, "utf8"),
    ]);

    expect(t24).toContain("# T24 closure evidence");
    expect(t25).toContain("# T25 sub-PRD closure evidence");
    expect(repair).toContain("# Closure-evidence repair audit");

    expect(audit).toContain("docs/t24-closure-evidence.md");
    expect(audit).toContain("docs/t25-sub-prd-closure-evidence.md");
    expect(audit).toContain("docs/closure-evidence-repair.md");
  });

  it("records the durable browser and visual-regression acceptance runs", async () => {
    const runs = await readAcceptanceRunsDocument();

    expect(runs).toContain("https://github.com/rafaelromao/slotmerge/actions/runs/30468611477");
    expect(runs).toContain("https://github.com/rafaelromao/slotmerge/actions/runs/30468610737");
    expect(runs).toContain("success");
    expect(runs).toContain("`75c85c53`");
    expect(runs).toContain("`6a07d301`");
  });

  it("lists the implementation fix PRs in the commit chain", async () => {
    const runs = await readAcceptanceRunsDocument();

    expect(runs).toContain("[#354](https://github.com/rafaelromao/slotmerge/pull/354)");
    expect(runs).toContain("[#355](https://github.com/rafaelromao/slotmerge/pull/355)");
    expect(runs).toContain("[#359](https://github.com/rafaelromao/slotmerge/pull/359)");
    expect(runs).toContain("[#360](https://github.com/rafaelromao/slotmerge/pull/360)");
    expect(runs).toContain("[#361](https://github.com/rafaelromao/slotmerge/pull/361)");
  });

  it("enumerates the per-surface PNG inventory at the audit window", async () => {
    const runs = await readAcceptanceRunsDocument();

    for (const path of [
      "tests/e2e-browser/screenshots/sign-in/",
      "tests/e2e-browser/screenshots/setup-home/",
      "tests/e2e-browser/screenshots/user/profile/",
      "tests/e2e-browser/screenshots/user/discoverability/",
      "tests/e2e-browser/screenshots/user/topics/",
      "tests/e2e-browser/screenshots/user/availability/",
      "tests/e2e-browser/screenshots/user/calendar-connection/",
      "tests/e2e-browser/screenshots/calendar-connections/",
      "tests/e2e-browser/screenshots/self-delete/",
      "tests/e2e-browser/screenshots/search-form/",
      "tests/e2e-browser/screenshots/search-result/",
      "tests/e2e-browser/screenshots/search-history/",
      "tests/e2e-browser/screenshots/admin/users/",
      "tests/e2e-browser/screenshots/admin/topics/",
      "tests/e2e-browser/screenshots/admin/status/",
    ]) {
      expect(
        runs,
        `acceptance-runs document must list PNG path "${path}"`,
      ).toContain(path);
    }
  });

  it("enumerates the user-facing canonical AGENTS.md acceptance bar items", async () => {
    const [audit, agents] = await Promise.all([
      readAuditDocument(),
      readFile(AGENTS_PATH, "utf8"),
    ]);

    const gateStart = agents.indexOf("Rendered-screen and browser-journey completion gates");
    expect(gateStart).toBeGreaterThan(-1);
    const gateEnd = agents.indexOf("- **Glossary**", gateStart);
    expect(gateEnd).toBeGreaterThan(gateStart);
    const gatesBlock = agents.slice(gateStart, gateEnd);
    expect(gatesBlock).toContain("Playwright happy-path");
    expect(gatesBlock).toContain("Playwright failure-path");
    expect(gatesBlock).toContain("Vitest unit");
    expect(gatesBlock).toContain("Component tests");
    expect(gatesBlock).toContain("Visual capture");
    expect(gatesBlock).toContain("WCAG 2.1 AA");
    expect(gatesBlock).toContain("Three-tier responsive");
    expect(gatesBlock).toContain("SSR first paint");
    expect(gatesBlock).toContain("Empty state");
    expect(gatesBlock).toContain("Browser-journey coverage");
    expect(gatesBlock).toContain("CI gate policy");
    expect(gatesBlock).toContain("Tracker closure rule");

    expect(audit).toContain("Playwright happy-path");
    expect(audit).toContain("Playwright failure-path");
    expect(audit).toContain("Vitest unit");
    expect(audit).toContain("Component test");
    expect(audit).toContain("Visual capture");
    expect(audit).toContain("AGENTS.md acceptance bar");
  });

  it("preserves the AGENTS.md stand-alone-closure prohibition", async () => {
    const document = await readAuditDocument();

    expect(document).toContain(
      'The legacy "Closed by sandman — issue already completed" auto-closure comment is not a substitute for the closure-evidence set',
    );
  });

  it("declares the final-audit closure-evidence comment template", async () => {
    const document = await readAuditDocument();

    expect(document).toContain("> Final-audit record from [#349]");
    expect(document).toContain("Closes #<issue>; this comment is the final-audit closure-evidence record");
  });

  it("anchors the durable audit-record link to the canonical document path", async () => {
    const document = await readAuditDocument();

    expect(document).toContain("[docs/issue-349-final-audit.md]");
    expect(document).toContain("docs/t349-acceptance-runs.md");
  });

  it("pins the final-audit closure-evidence comment URL for every target issue", async () => {
    const document = await readAuditDocument();

    for (const issue of TARGET_ISSUES) {
      expect(
        document,
        `audit document must pin the final-audit closure-evidence comment URL for issue #${issue.issue}`,
      ).toContain(issue.closureCommentUrl);
    }
  });

  it("pins the verbatim disclaimer prefix in the closure comments", async () => {
    for (const issue of TARGET_ISSUES) {
      const fetched = await fetch(
        `https://api.github.com/repos/rafaelromao/slotmerge/issues/${issue.issue}/comments`,
      );
      const comments = (await fetched.json()) as Array<{ body: string }>;
      const finalAuditComment = comments.find((c) =>
        c.body.includes("Final-audit record from"),
      );
      expect(
        finalAuditComment,
        `issue #${issue.issue} must carry the final-audit closure-evidence comment`,
      ).toBeDefined();
      expect(
        finalAuditComment?.body ?? "",
        `issue #${issue.issue} closure comment must include the canonical disclaimer`,
      ).toContain("docs/issue-349-final-audit.md");
      expect(
        finalAuditComment?.body ?? "",
        `issue #${issue.issue} closure comment must include the closing reference`,
      ).toContain(`Closes #${issue.issue}`);
    }
  });

  it("does not record a remain-open findings report", async () => {
    const document = await readAuditDocument();

    const findingsHeading = document.indexOf("## Missing-screenshot / stale-summary audit");
    const nextHeading = document.indexOf("## PR-CI gate", findingsHeading);
    expect(findingsHeading).toBeGreaterThan(-1);
    expect(nextHeading).toBeGreaterThan(findingsHeading);

    const findingsSection = document.slice(findingsHeading, nextHeading);
    expect(
      findingsSection,
      "missing-screenshot audit must not record an open-findings report",
    ).toContain("no missing screenshots, no stale summaries, no invalid closure comments");
  });

  it("pins the t348 acceptance summary as the durable bug-fix record", async () => {
    const [runs, summary] = await Promise.all([
      readAcceptanceRunsDocument(),
      readFile(T348_ACCEPTANCE_SUMMARY_PATH, "utf8"),
    ]);

    expect(summary).toContain("# Issue #348 — Final browser and visual acceptance on the complete app");
    expect(runs).toContain("[`docs/t348-acceptance-summary.md`](t348-acceptance-summary.md)");
  });
});