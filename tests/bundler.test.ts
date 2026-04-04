import { describe, it, expect } from "vitest";
import { truncateAtBoundary } from "../src/bundler.js";

describe("truncateAtBoundary", () => {
  it("uses multi-position sampling when truncating", () => {
    const text = "a".repeat(200_000);
    const result = truncateAtBoundary(text, 100_000);
    // Should be around 100K + gap markers
    expect(result.length).toBeLessThan(100_200);
    expect(result).toContain("// ... [gap:");
  });

  it("preserves content from start, middle, and end", () => {
    // Build text with identifiable sections — markers at very start and very end
    const text = "START_MARKER;\n" + "x".repeat(50000) + "\nEND_MARKER;\n";
    const result = truncateAtBoundary(text, 10000);
    expect(result).toContain("START_MARKER");
    expect(result).toContain("END_MARKER");
    expect(result).toContain("// ... [gap:");
  });

  it("returns full text if within limit", () => {
    const text = "short";
    const result = truncateAtBoundary(text, 1000);
    expect(result).toBe("short");
  });
});
