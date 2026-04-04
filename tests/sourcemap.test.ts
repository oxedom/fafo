import { describe, it, expect } from "vitest";
import { extractSourceMapUrl, formatSourceMapForLLM } from "../src/sourcemap.js";
import type { SourceMapData } from "../src/sourcemap.js";

describe("extractSourceMapUrl", () => {
  it("extracts absolute source map URL", () => {
    const content = `var x = 1;\n//# sourceMappingURL=https://cdn.example.com/app.js.map`;
    const result = extractSourceMapUrl(content, "https://example.com/app.js");
    expect(result).toBe("https://cdn.example.com/app.js.map");
  });

  it("resolves relative source map URL", () => {
    const content = `var x = 1;\n//# sourceMappingURL=app.js.map`;
    const result = extractSourceMapUrl(content, "https://example.com/assets/app.js");
    expect(result).toBe("https://example.com/assets/app.js.map");
  });

  it("handles @ prefix (older format)", () => {
    const content = `var x = 1;\n//@ sourceMappingURL=old.js.map`;
    const result = extractSourceMapUrl(content, "https://example.com/old.js");
    expect(result).toBe("https://example.com/old.js.map");
  });

  it("returns null for data URIs", () => {
    const content = `var x = 1;\n//# sourceMappingURL=data:application/json;base64,abc123`;
    const result = extractSourceMapUrl(content, "https://example.com/app.js");
    expect(result).toBeNull();
  });

  it("returns null when no source map comment", () => {
    const content = `var x = 1; var y = 2;`;
    const result = extractSourceMapUrl(content, "https://example.com/app.js");
    expect(result).toBeNull();
  });
});

describe("formatSourceMapForLLM", () => {
  it("formats source map data", () => {
    const data: SourceMapData = {
      url: "https://example.com/app.js.map",
      originalFiles: [
        "src/components/App.tsx",
        "src/utils/api.ts",
        "node_modules/react/index.js",
      ],
      moduleStructure: ["src", "node_modules/react"],
      hasSourceContent: true,
    };

    const text = formatSourceMapForLLM(data);
    expect(text).toContain("Source Map: https://example.com/app.js.map");
    expect(text).toContain("Original files: 3");
    expect(text).toContain("Has source content: true");
    expect(text).toContain("src/components/App.tsx");
    expect(text).toContain("src/utils/api.ts");
    // node_modules files should not appear in app source files
    expect(text).not.toContain("node_modules/react/index.js");
  });
});
