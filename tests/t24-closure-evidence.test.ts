import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const DOCUMENT_PATH = "docs/t24-closure-evidence.md";
const AGENTS_PATH = "AGENTS.md";
const AGENTS_CLOSURE_GATE_FIRST_LINE = 51;
const AGENTS_CLOSURE_GATE_LAST_LINE = 66;

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
});
