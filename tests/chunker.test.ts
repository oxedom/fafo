import { describe, it, expect } from "vitest";
import { chunkBundles } from "../src/chunker.js";
import type { BundleContent } from "../src/types.js";

describe("chunkBundles", () => {
  it("returns a single chunk for small bundles", () => {
    const bundles: BundleContent[] = [
      {
        url: "https://example.com/main.js",
        truncated: false,
        originalSizeBytes: 100,
        content: 'const x = 1;\nconst y = 2;\nconsole.log(x + y);',
      },
    ];

    const chunks = chunkBundles(bundles, 8000, 400);
    expect(chunks.length).toBe(1);
    expect(chunks[0].bundleUrl).toBe("https://example.com/main.js");
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].totalChunks).toBe(1);
  });

  it("splits large bundles into multiple chunks", () => {
    // Generate a large bundle
    const lines: string[] = [];
    for (let i = 0; i < 500; i++) {
      lines.push(`function handler_${i}() {`);
      lines.push(`  const result = fetch("/api/endpoint_${i}");`);
      lines.push(`  return result;`);
      lines.push(`}`);
      lines.push(``);
    }

    const bundles: BundleContent[] = [
      {
        url: "https://example.com/app.js",
        truncated: false,
        originalSizeBytes: lines.join("\n").length,
        content: lines.join("\n"),
      },
    ];

    const chunks = chunkBundles(bundles, 2000, 200);
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should have correct metadata
    for (const chunk of chunks) {
      expect(chunk.bundleUrl).toBe("https://example.com/app.js");
      expect(chunk.totalChunks).toBe(chunks.length);
      expect(chunk.charCount).toBe(chunk.content.length);
    }

    // Chunks should be ordered
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].index).toBe(i);
    }
  });

  it("beautifies minified code before chunking", () => {
    const minified = 'function a(){var b=1;if(b>0){console.log(b)}return b}function c(){var d=2;return d}';

    const bundles: BundleContent[] = [
      {
        url: "https://example.com/min.js",
        truncated: false,
        originalSizeBytes: minified.length,
        content: minified,
      },
    ];

    const chunks = chunkBundles(bundles, 8000, 400);
    // After beautification, the code should have newlines and indentation
    expect(chunks[0].content).toContain("\n");
    expect(chunks[0].content).toContain("  ");
  });

  it("handles multiple bundles", () => {
    const bundles: BundleContent[] = [
      {
        url: "https://example.com/a.js",
        truncated: false,
        originalSizeBytes: 50,
        content: 'const a = 1;',
      },
      {
        url: "https://example.com/b.js",
        truncated: false,
        originalSizeBytes: 50,
        content: 'const b = 2;',
      },
    ];

    const chunks = chunkBundles(bundles, 8000, 400);
    expect(chunks.length).toBe(2);
    expect(chunks[0].bundleUrl).toBe("https://example.com/a.js");
    expect(chunks[1].bundleUrl).toBe("https://example.com/b.js");
  });
});
