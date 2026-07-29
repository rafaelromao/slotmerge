import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const DOCUMENT_PATH = "docs/closure-evidence-repair.md";
const T24_DOCUMENT_PATH = "docs/t24-closure-evidence.md";
const T25_DOCUMENT_PATH = "docs/t25-sub-prd-closure-evidence.md";
const IMPLEMENTATION_GRAPH_PATH = "docs/implementation-graph.md";

interface DeficientTicket {
  readonly id: string;
  readonly issue: number;
  readonly sectionHeading: string;
  readonly vitestPath: string;
  readonly componentPath: string | null;
  readonly visualCommitted: string | null;
  readonly visualArtifact: string | null;
  readonly pr: number | null;
  readonly correctiveCommentUrl: string;
}

const CATEGORY_A_TICKETS: readonly DeficientTicket[] = [
  {
    id: "A1",
    issue: 15,
    sectionHeading:
      "A1. [#15](https://github.com/rafaelromao/slotmerge/issues/15) Sub-PRD: Search & Matching",
    vitestPath: "tests/workflow-search.test.ts",
    componentPath: "tests/app-searches-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/search-form/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/15#issuecomment-5111930041",
  },
  {
    id: "A2",
    issue: 16,
    sectionHeading:
      "A2. [#16](https://github.com/rafaelromao/slotmerge/issues/16) Sub-PRD: Auth & Invites",
    vitestPath: "src/workflow/auth.test.ts",
    componentPath: "tests/app-sign-in-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/sign-in/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/16#issuecomment-5111930110",
  },
  {
    id: "A3",
    issue: 17,
    sectionHeading:
      "A3. [#17](https://github.com/rafaelromao/slotmerge/issues/17) Sub-PRD: Calendar Connections",
    vitestPath: "src/workflow/calendar-connection.test.ts",
    componentPath: "tests/app-me-calendar-connections-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/calendar-connections/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/17#issuecomment-5111930172",
  },
  {
    id: "A4",
    issue: 18,
    sectionHeading:
      "A4. [#18](https://github.com/rafaelromao/slotmerge/issues/18) Sub-PRD: Admin & Notifications",
    vitestPath: "src/workflow/admin-users.test.ts",
    componentPath: "tests/app-admin-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/admin/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/18#issuecomment-5111930281",
  },
  {
    id: "A5",
    issue: 19,
    sectionHeading:
      "A5. [#19](https://github.com/rafaelromao/slotmerge/issues/19) Sub-PRD: Profile & Setup",
    vitestPath: "src/profile/profile-workflow.test.ts",
    componentPath: "tests/app-me-profile-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/user/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/19#issuecomment-5111930358",
  },
  {
    id: "A6",
    issue: 33,
    sectionHeading:
      "A6. [#33](https://github.com/rafaelromao/slotmerge/issues/33) Define weekly Availability Windows in profile timezone",
    vitestPath: "tests/e2e/define-weekly-availability-windows.test.ts",
    componentPath: "tests/app-me-availability-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/user/availability/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/33#issuecomment-5111930429",
  },
  {
    id: "A7",
    issue: 37,
    sectionHeading:
      "A7. [#37](https://github.com/rafaelromao/slotmerge/issues/37) Invite a User with email and role from Admin UI",
    vitestPath: "tests/e2e/admin-invites-user-from-admin-users-screen.test.ts",
    componentPath: "tests/app-admin-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/admin/users/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/37#issuecomment-5111930488",
  },
  {
    id: "A8",
    issue: 45,
    sectionHeading:
      "A8. [#45](https://github.com/rafaelromao/slotmerge/issues/45) Encrypt Calendar Connection OAuth tokens at rest",
    vitestPath: "tests/calendar-token-encryption.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/45#issuecomment-5111930538",
  },
  {
    id: "A9",
    issue: 49,
    sectionHeading:
      "A9. [#49](https://github.com/rafaelromao/slotmerge/issues/49) Disconnect a Calendar Connection",
    vitestPath:
      "tests/e2e/disconnect-removes-tokens-and-prevents-further-sync.test.ts",
    componentPath: "tests/app-me-calendar-connections-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/calendar-connections/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/49#issuecomment-5111930596",
  },
  {
    id: "A10",
    issue: 52,
    sectionHeading:
      "A10. [#52](https://github.com/rafaelromao/slotmerge/issues/52) Trigger Calendar Connection action-required email",
    vitestPath: "tests/e2e/action-required-email-on-token-revocation.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/52#issuecomment-5111930657",
  },
  {
    id: "A11",
    issue: 98,
    sectionHeading:
      "A11. [#98](https://github.com/rafaelromao/slotmerge/issues/98) E2E test: Calendar Connection action-required state sends email",
    vitestPath: "tests/e2e/action-required-email-on-token-revocation.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/98#issuecomment-5111930728",
  },
  {
    id: "A12",
    issue: 108,
    sectionHeading:
      "A12. [#108](https://github.com/rafaelromao/slotmerge/issues/108) E2E test: clicking a Slot opens a drawer with matching Users",
    vitestPath: "tests/workflow-search.test.ts",
    componentPath: "tests/slot-details-drawer.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/search-result/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/108#issuecomment-5111930786",
  },
  {
    id: "A13",
    issue: 114,
    sectionHeading:
      "A13. [#114](https://github.com/rafaelromao/slotmerge/issues/114) E2E test: match only considers setup-complete users",
    vitestPath: "tests/e2e/setup-checklist-gates-matching-eligibility.test.ts",
    componentPath: "tests/app-setup-home-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/setup-home/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/114#issuecomment-5111930848",
  },
  {
    id: "A14",
    issue: 279,
    sectionHeading:
      "A14. [#279](https://github.com/rafaelromao/slotmerge/issues/279) Define rendered-screen and browser-journey completion gates",
    vitestPath: "tests/t24-closure-evidence.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/279#issuecomment-5111930904",
  },
  {
    id: "A15",
    issue: 307,
    sectionHeading:
      "A15. [#307](https://github.com/rafaelromao/slotmerge/issues/307) T21 E2E plan #62 in-place update",
    vitestPath: "tests/retired-routes.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/307#issuecomment-5111930980",
  },
  {
    id: "A16",
    issue: 326,
    sectionHeading:
      "A16. [#326](https://github.com/rafaelromao/slotmerge/issues/326) Commit Search-form visual-capture baselines",
    vitestPath: "tests/workflow-search.test.ts",
    componentPath: "tests/app-searches-page.test.tsx",
    visualCommitted: "tests/e2e-browser/screenshots/search-form/",
    visualArtifact: "visual-regression.yml",
    pr: null,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/326#issuecomment-5111931052",
  },
] as const;

const CATEGORY_B_TICKETS: readonly DeficientTicket[] = [
  {
    id: "B1",
    issue: 343,
    sectionHeading:
      "B1. [#343](https://github.com/rafaelromao/slotmerge/issues/343) Fix Search candidate preparation to run once per Search",
    vitestPath: "tests/workflow-search.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: 350,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/343#issuecomment-5111931105",
  },
  {
    id: "B2",
    issue: 344,
    sectionHeading:
      "B2. [#344](https://github.com/rafaelromao/slotmerge/issues/344) Restore repo-wide AppClock boundary ownership",
    vitestPath: "tests/appclock-boundary-migration.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: 353,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/344#issuecomment-5111931149",
  },
  {
    id: "B3",
    issue: 345,
    sectionHeading:
      "B3. [#345](https://github.com/rafaelromao/slotmerge/issues/345) Complete Admin Invite shell and repository migration",
    vitestPath: "tests/admin-shell-repository-migration.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: 352,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/345#issuecomment-5111931206",
  },
  {
    id: "B4",
    issue: 346,
    sectionHeading:
      "B4. [#346](https://github.com/rafaelromao/slotmerge/issues/346) Resolve localTime timezone validation contract",
    vitestPath: "src/time/local-time.test.ts",
    componentPath: null,
    visualCommitted: null,
    visualArtifact: null,
    pr: 351,
    correctiveCommentUrl:
      "https://github.com/rafaelromao/slotmerge/issues/346#issuecomment-5111931274",
  },
] as const;

const ALL_TICKETS: readonly DeficientTicket[] = [
  ...CATEGORY_A_TICKETS,
  ...CATEGORY_B_TICKETS,
];

async function readDocument(): Promise<string> {
  return readFile(DOCUMENT_PATH, "utf8");
}

function extractTicketSections(
  document: string,
  headings: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (!heading) continue;
    const start = document.indexOf(heading);
    if (start === -1) {
      throw new Error(`section heading not found: ${heading}`);
    }
    const afterHeading = start + heading.length;
    const nextHeading = headings[i + 1];
    const end = nextHeading ? document.indexOf(nextHeading, afterHeading) : -1;
    const sliceEnd = end === -1 ? undefined : end;
    map.set(heading, document.slice(start, sliceEnd));
  }
  return map;
}

function readFields(section: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const lines = section.split("\n");
  for (const line of lines) {
    const match = line.match(/^- \*\*([A-G])\. (.+?)\*\*: (.+)$/);
    if (!match) continue;
    const [, letter, name, value] = match;
    if (!letter || !name || value === undefined) continue;
    const key = `${letter}. ${name}`;
    fields[key] = value;
  }
  return fields;
}

describe("closure-evidence repair audit", () => {
  it("exists at the canonical path with the audit-document heading", async () => {
    const document = await readDocument();

    const headingMatch = document.match(/^# .+$/m);
    expect(headingMatch).not.toBeNull();
    expect(headingMatch?.[0] ?? "").toMatch(
      /^# Closure-evidence repair audit\b/,
    );
  });

  it("cross-references the issue tracker, the Vitest guard file, and #347", async () => {
    const document = await readDocument();

    expect(document).toContain("tests/closure-evidence-repair.test.ts");
    expect(document).toContain("issues/347");
  });

  it("contains every mandatory top-level section", async () => {
    const document = await readDocument();

    for (const heading of [
      "## Scope",
      "## Deficient categories",
      "## Closure-evidence standard",
      "## Per-ticket evidence — Category A (prohibited stand-alone comment)",
      "## Per-ticket evidence — Category B (missing closing comment)",
      "## Corrective comment template",
      "## Practical constraints (comment-only repair)",
      "## Inconsistency callouts",
      "## Reopening safety",
      "## Open blockers (unchanged)",
      "## PR-CI gate",
    ]) {
      expect(
        document,
        `audit document must contain the "${heading}" section`,
      ).toContain(heading);
    }
  });

  it("names AGENTS.md as the source of the closure-gate language", async () => {
    const document = await readDocument();

    expect(document).toContain("AGENTS.md");
    expect(document).toContain("lines 51");
    expect(document).toContain(
      'The legacy "Closed by sandman — issue already completed" auto-closure comment',
    );
  });

  it("distinguishes committed screenshot baselines from workflow artifacts", async () => {
    const document = await readDocument();

    expect(document).toContain("committed baselines");
    expect(document).toContain("workflow artifact");
    expect(document).toContain("workflow_dispatch");
    expect(document).toContain("visual-regression.yml");
  });

  it("records a per-ticket evidence row for every deficient implementation ticket", async () => {
    const document = await readDocument();
    const headings = ALL_TICKETS.map((t) => t.sectionHeading);
    const sections = extractTicketSections(document, headings);

    for (const ticket of ALL_TICKETS) {
      const section = sections.get(ticket.sectionHeading);
      expect(section, `section heading for ${ticket.id}`).toBeDefined();
      expect(section, `${ticket.id} section starts with the heading`).toMatch(
        /^[AB]\d+\.\s*\[/,
      );
      expect(
        section,
        `${ticket.id} contains the canonical ticket link`,
      ).toContain(
        `[#${ticket.issue}](https://github.com/rafaelromao/slotmerge/issues/${ticket.issue})`,
      );
    }
  });

  it("pins the canonical Vitest test path for every deficient ticket", async () => {
    const document = await readDocument();
    const headings = ALL_TICKETS.map((t) => t.sectionHeading);
    const sections = extractTicketSections(document, headings);

    for (const ticket of ALL_TICKETS) {
      const section = sections.get(ticket.sectionHeading) ?? "";
      const fields = readFields(section);
      const bLine = fields["B. Vitest unit test"];
      expect(
        bLine,
        `${ticket.id} must declare a Vitest unit test field`,
      ).toBeDefined();
      expect(
        bLine ?? "",
        `${ticket.id} must list the Vitest path \`${ticket.vitestPath}\``,
      ).toContain(ticket.vitestPath);
    }
  });

  it("pins a component path or a documented n/a rationale for every deficient ticket", async () => {
    const document = await readDocument();
    const headings = ALL_TICKETS.map((t) => t.sectionHeading);
    const sections = extractTicketSections(document, headings);

    for (const ticket of ALL_TICKETS) {
      const section = sections.get(ticket.sectionHeading) ?? "";
      const fields = readFields(section);
      const cLine = fields["C. Component test"];
      expect(
        cLine,
        `${ticket.id} must declare a Component test field`,
      ).toBeDefined();
      const cValue = cLine ?? "";

      if (ticket.componentPath === null) {
        expect(
          cValue,
          `${ticket.id} C field must start with "n/a" when no component path is declared`,
        ).toMatch(/^n\/a/);
      } else {
        expect(
          cValue,
          `${ticket.id} C field must include \`${ticket.componentPath}\``,
        ).toContain(ticket.componentPath);
      }
    }
  });

  it("distinguishes committed-baseline vs. workflow-artifact visual-capture cells", async () => {
    const document = await readDocument();
    const headings = ALL_TICKETS.map((t) => t.sectionHeading);
    const sections = extractTicketSections(document, headings);

    for (const ticket of ALL_TICKETS) {
      const section = sections.get(ticket.sectionHeading) ?? "";
      const fields = readFields(section);

      const dLine = fields["D. Visual capture (committed)"];
      const eLine = fields["E. Visual capture (workflow artifact)"];

      expect(
        dLine,
        `${ticket.id} must declare a D (committed) field`,
      ).toBeDefined();
      expect(
        eLine,
        `${ticket.id} must declare an E (workflow artifact) field`,
      ).toBeDefined();

      const dValue = dLine ?? "";
      const eValue = eLine ?? "";

      const dHasCommitted = ticket.visualCommitted
        ? dValue.includes(ticket.visualCommitted)
        : dValue.startsWith("n/a");
      expect(
        dHasCommitted,
        `${ticket.id} D field must reference committed baselines or start with n/a`,
      ).toBe(true);

      const eHasArtifact = ticket.visualArtifact
        ? eValue.includes(ticket.visualArtifact)
        : eValue.startsWith("n/a");
      expect(
        eHasArtifact,
        `${ticket.id} E field must reference workflow artifacts or start with n/a`,
      ).toBe(true);
    }
  });

  it("pins a closing-PR URL for every Category B ticket", async () => {
    const document = await readDocument();
    const headings = CATEGORY_B_TICKETS.map((t) => t.sectionHeading);
    const sections = extractTicketSections(document, headings);

    for (const ticket of CATEGORY_B_TICKETS) {
      expect(
        ticket.pr,
        `${ticket.id} must declare a closing PR`,
      ).not.toBeNull();
      const url = `https://github.com/rafaelromao/slotmerge/pull/${ticket.pr}`;
      const section = sections.get(ticket.sectionHeading) ?? "";
      expect(section, `${ticket.id} must reference ${url}`).toContain(url);
    }
  });

  it("records the AGENTS.md acceptance-bar back-reference for every row", async () => {
    const document = await readDocument();
    const headings = ALL_TICKETS.map((t) => t.sectionHeading);
    const sections = extractTicketSections(document, headings);

    for (const ticket of ALL_TICKETS) {
      const section = sections.get(ticket.sectionHeading) ?? "";
      const fields = readFields(section);
      const fLine = fields["F. AGENTS.md acceptance bar"];
      expect(
        fLine,
        `${ticket.id} must declare an F (acceptance bar) field`,
      ).toBeDefined();
      expect(
        fLine ?? "",
        `${ticket.id} F field must reference the AGENTS.md bar, per-ticket AC, or implementation graph`,
      ).toMatch(
        /AGENTS\.md|acceptance criteria|implementation-graph|issues\/\d+ acceptance/,
      );
    }
  });

  it("pins the corrective-comment URL fragment for every deficient ticket", async () => {
    const document = await readDocument();
    const headings = ALL_TICKETS.map((t) => t.sectionHeading);
    const sections = extractTicketSections(document, headings);

    for (const ticket of ALL_TICKETS) {
      const section = sections.get(ticket.sectionHeading) ?? "";
      expect(
        section,
        `${ticket.id} G field must reference the corrective comment URL`,
      ).toContain(ticket.correctiveCommentUrl);
    }
  });

  it("disallows the prohibited stand-alone comment as the only closure record", async () => {
    const document = await readDocument();

    expect(document).toContain(
      "superseded by this record per AGENTS.md line 66",
    );
    expect(document).not.toMatch(
      /^> Closed by sandman — issue already completed\.$/m,
    );
  });

  it("uses the canonical `## Closure Evidence` template header", async () => {
    const document = await readDocument();

    expect(document).toContain(
      "## Closure Evidence\n\n> Audit-repair record from [#347]",
    );
  });

  it("names the seven canonical fields in the corrective comment template", async () => {
    const document = await readDocument();

    for (const field of [
      "Playwright happy-path spec",
      "Playwright failure-path spec",
      "Vitest unit test",
      "Component test",
      "Visual capture (committed baselines)",
      "Visual capture (workflow artifact)",
      "AGENTS.md acceptance bar checked",
      "Closure PR",
    ]) {
      expect(
        document,
        `corrective-comment template must name the canonical field "${field}"`,
      ).toContain(`- **${field}**:`);
    }
  });

  it("records the AGENTS.md line 65 (CI gate) reference rather than line 64", async () => {
    const document = await readDocument();

    expect(document).toContain("AGENTS.md line 65");
    expect(document).not.toMatch(/AGENTS\.md line 64\b/);
  });

  it("surfaces the #15 closure-while-blocked inconsistency", async () => {
    const document = await readDocument();

    expect(document).toContain("Sub-PRD: Search & Matching");
    expect(document).toContain("T10");
    expect(document).toContain("issues/296");
    expect(document).toMatch(/Inconsistency callouts/);
  });

  it("records every audit-window open blocker as unchanged", async () => {
    const document = await readDocument();

    for (const issue of [296, 303, 304, 305]) {
      expect(document).toContain(`issues/${issue}`);
    }
  });

  it("preserves the locked PR-CI gate and the workflow-dispatch Playwright lane", async () => {
    const document = await readDocument();

    expect(document).toContain("pnpm typecheck");
    expect(document).toContain("pnpm lint");
    expect(document).toContain("pnpm format:check");
    expect(document).toContain("pnpm test");
    expect(document).toContain("pnpm build");
    expect(document).toContain("workflow_dispatch");
  });

  it("remains consistent with the T24 closure evidence document", async () => {
    const [document, t24] = await Promise.all([
      readDocument(),
      readFile(T24_DOCUMENT_PATH, "utf8"),
    ]);

    expect(t24).toContain("# T24 closure evidence");
    for (const issue of [296, 303, 304, 305]) {
      expect(t24).toContain(`issues/${issue}`);
    }

    expect(document).toContain("docs/t24-closure-evidence.md");
  });

  it("remains consistent with the T25 sub-PRD closure evidence document", async () => {
    const [document, t25] = await Promise.all([
      readDocument(),
      readFile(T25_DOCUMENT_PATH, "utf8"),
    ]);

    expect(t25).toContain("# T25 sub-PRD closure evidence");
    expect(document).toContain("docs/t25-sub-prd-closure-evidence.md");
  });

  it("cross-references the implementation graph for screen-level evidence rows", async () => {
    const [document, graph] = await Promise.all([
      readDocument(),
      readFile(IMPLEMENTATION_GRAPH_PATH, "utf8"),
    ]);

    expect(graph).toContain("# SlotMerge Implementation Ticket Graph");
    expect(document).toContain("docs/implementation-graph.md");
  });
});
