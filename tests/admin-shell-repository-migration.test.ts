import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const SHELL_IMPORTS = [
  "renderAdminShell",
  "adminAccessDeniedResponse",
  "isAdminSession",
  "htmlResponse",
  "escapeHtml",
] as const;

const PRIVATE_SHADOW_FUNCTIONS = [
  "function isAdminSession",
  "function createAccessDeniedResponse",
  "function htmlResponse",
  "function escapeHtml",
] as const;

const PRIVATE_PAGE_RENDERERS = [
  "function renderAdminInvitesPage",
  "function renderAdminUsersPage",
  "function renderAdminTopicsPage",
  "function renderTopicProposalsPage",
  "function renderOperationalStatusPage",
] as const;

const ADMIN_HANDLER_FILES = [
  "src/admin/invites.ts",
  "src/admin/users.ts",
  "src/admin/topics.ts",
  "src/admin/topic-proposals.ts",
  "src/admin/operational-status.ts",
] as const;

type HandlerFile = (typeof ADMIN_HANDLER_FILES)[number];

async function loadHandlerSource(file: HandlerFile): Promise<string> {
  return readFile(file, "utf8");
}

function assertSharedShellImports(source: string, file: HandlerFile): void {
  for (const name of SHELL_IMPORTS) {
    expect(
      source,
      `${file} should import ${name} from "./page" (shared Admin shell)`,
    ).toContain(`${name}`);
    const importBlockRegex = new RegExp(
      `import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*["']\\./page["']`,
    );
    expect(
      importBlockRegex.test(source),
      `${file} should import ${name} from "./page" (shared Admin shell)`,
    ).toBe(true);
  }
}

function assertNoPrivateShadowHelpers(source: string, file: HandlerFile): void {
  for (const declaration of PRIVATE_SHADOW_FUNCTIONS) {
    expect(
      source,
      `${file} should not redeclare shared helper ${declaration}`,
    ).not.toContain(declaration);
  }
  for (const renderer of PRIVATE_PAGE_RENDERERS) {
    expect(
      source,
      `${file} should not declare a private shell renderer ${renderer}`,
    ).not.toContain(renderer);
  }
}

function assertDelegatesToDedicatedRepository(
  source: string,
  file: HandlerFile,
): void {
  expect(
    source,
    `${file} should not call getDb() inline (no inline Drizzle access)`,
  ).not.toMatch(/\bgetDb\s*\(/);
  expect(
    source,
    `${file} should not run db.select() inline (no inline Drizzle queries)`,
  ).not.toMatch(/\bdb\.select\s*\(/);
  expect(
    source,
    `${file} should not run db.insert() inline (no inline Drizzle queries)`,
  ).not.toMatch(/\bdb\.insert\s*\(/);
  expect(
    source,
    `${file} should not run db.update() inline (no inline Drizzle queries)`,
  ).not.toMatch(/\bdb\.update\s*\(/);
  expect(
    source,
    `${file} should not define a private databaseXRepository constant`,
  ).not.toMatch(/const\s+database[A-Z]\w*Repository\s*:/);

  const delegatesViaAccessor = /\bget[A-Z]\w*Repository\s*\(/.test(source);
  const delegatesViaFactory =
    /\bcreatePostgres(?:Invite|AdminUser|OperationalStatus|TopicProposal|TopicAdmin|TopicCatalogue)\w*\s*\(/.test(
      source,
    );
  const delegatesViaImportFromSibling = /from\s+["'](?:\.\.?\/[^"']+repository(?:\.ts)?|\.\.?\/topics\/repository(?:\.ts)?|\.\.?\/topics\/proposals\.repository(?:\.ts)?)["']/.test(
    source,
  );

  expect(
    delegatesViaAccessor || delegatesViaFactory || delegatesViaImportFromSibling,
    `${file} should delegate persistence to a dedicated repository boundary (via createPostgres*Repository factory, get*Repository accessor, or a *.repository import)`,
  ).toBe(true);
}

describe("admin shell and repository migration", () => {
  it("keeps the shared Admin shell module exporting renderAdminShell and friends", async () => {
    const pageSource = await readFile("src/admin/page.ts", "utf8");

    for (const name of SHELL_IMPORTS) {
      expect(pageSource).toContain(`export function ${name}`);
    }
  });

  describe.each(ADMIN_HANDLER_FILES)("%s", (file) => {
    it("imports shell primitives from the shared ./page module", async () => {
      const source = await loadHandlerSource(file);
      assertSharedShellImports(source, file);
    });

    it("does not redeclare any shared helper or render its own page shell", async () => {
      const source = await loadHandlerSource(file);
      assertNoPrivateShadowHelpers(source, file);
    });

    it("delegates persistence to a dedicated repository boundary", async () => {
      const source = await loadHandlerSource(file);
      assertDelegatesToDedicatedRepository(source, file);
    });
  });

  it("shows that the Admin Invite handler delegates to the dedicated Invite repository", async () => {
    const source = await loadHandlerSource("src/admin/invites.ts");

    expect(source).toContain(
      'createPostgresInviteRepository',
    );
    expect(source).toMatch(
      /from\s+["']\.\/invites\.repository(?:\.ts)?["']/,
    );
  });
});