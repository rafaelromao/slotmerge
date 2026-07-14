import { describe, expect, it } from "vitest";

import {
  computeSimilarity,
  isSimilar,
  normalizeTopicName,
} from "../src/topics/proposals";

describe("normalizeTopicName", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeTopicName("  Sailing  ")).toBe("sailing");
  });

  it("collapses internal whitespace to single space", () => {
    expect(normalizeTopicName("Product  Strategy")).toBe("product strategy");
    expect(normalizeTopicName("Product    Strategy   Workshop")).toBe(
      "product strategy workshop",
    );
  });

  it("converts to lowercase", () => {
    expect(normalizeTopicName("SAILING")).toBe("sailing");
    expect(normalizeTopicName("Product Strategy")).toBe("product strategy");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeTopicName("   ")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeTopicName("")).toBe("");
  });
});

describe("isSimilar", () => {
  it("returns true for identical strings", () => {
    expect(isSimilar("Sailing", "Sailing")).toBe(true);
  });

  it("returns true for case-insensitive identical strings", () => {
    expect(isSimilar("Sailing", "sailing")).toBe(true);
    expect(isSimilar("SAILING", "Sailing")).toBe(true);
  });

  it("returns true for whitespace-normalized identical strings", () => {
    expect(isSimilar("Product Strategy", "  Product  Strategy  ")).toBe(true);
  });

  it("returns false for completely different strings", () => {
    expect(isSimilar("Sailing", "Engineering")).toBe(false);
  });

  it("returns true for very similar strings above threshold", () => {
    expect(isSimilar("TypeScript", "Typescript")).toBe(true);
    expect(isSimilar("Sailing", "Sailing ")).toBe(true);
    expect(isSimilar("Product Strategy", "Product Strategy")).toBe(true);
  });

  it("returns false for similar but below threshold strings", () => {
    expect(isSimilar("React", "React.js")).toBe(false);
    expect(isSimilar("Sailing", "Sail")).toBe(false);
    expect(isSimilar("Engineering", "Software Engineering")).toBe(false);
  });

  it("returns false for empty string vs non-empty", () => {
    expect(isSimilar("", "Sailing")).toBe(false);
    expect(isSimilar("Sailing", "")).toBe(false);
  });
});

describe("computeSimilarity", () => {
  it("returns 1.0 for identical strings", () => {
    expect(computeSimilarity("Sailing", "Sailing")).toBe(1.0);
  });

  it("returns 1.0 for identical strings after whitespace normalization", () => {
    expect(computeSimilarity("Sailing", "  Sailing  ")).toBe(1.0);
  });

  it("returns 1.0 for same string different case", () => {
    expect(computeSimilarity("Sailing", "sailing")).toBe(1.0);
    expect(computeSimilarity("SAILING", "sailing")).toBe(1.0);
  });

  it("returns lower ratio for completely different strings", () => {
    const ratio = computeSimilarity("Sailing", "Engineering");
    expect(ratio).toBeLessThan(1.0);
    expect(ratio).toBeGreaterThan(0);
  });

  it("returns high ratio for similar strings", () => {
    const ratio = computeSimilarity("TypeScript", "Typescript");
    expect(ratio).toBeGreaterThan(0.9);
  });

  it("returns moderate ratio for partially similar strings", () => {
    const ratio = computeSimilarity("React", "React.js");
    expect(ratio).toBeGreaterThan(0.5);
    expect(ratio).toBeLessThan(1.0);
  });

  it("handles empty strings", () => {
    expect(computeSimilarity("", "")).toBe(1.0);
    expect(computeSimilarity("Sailing", "")).toBe(0);
  });

  it("treats whitespace-normalized strings as identical at ratio 1.0", () => {
    expect(computeSimilarity("Product  Strategy", "Product Strategy")).toBe(
      1.0,
    );
    expect(computeSimilarity("Product  Strategy", "product  strategy")).toBe(
      1.0,
    );
  });
});
