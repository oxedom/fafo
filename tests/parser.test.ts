import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractScripts, extractTitle } from "../src/parser.js";

const sampleHtml = readFileSync(
  resolve(__dirname, "fixtures/sample.html"),
  "utf-8"
);

describe("extractScripts", () => {
  it("extracts script tags with src attributes", () => {
    const scripts = extractScripts(sampleHtml, "https://example.com");
    // Should not include inline script, google-analytics, or jsdelivr CDN
    const srcs = scripts.map((s) => s.src);
    expect(srcs).not.toContain(
      "https://www.google-analytics.com/analytics.js"
    );
    expect(srcs).not.toContain(
      "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js"
    );
  });

  it("resolves relative URLs against base", () => {
    const scripts = extractScripts(sampleHtml, "https://example.com");
    const srcs = scripts.map((s) => s.src);
    expect(srcs).toContain(
      "https://example.com/static/js/main.abc123.js"
    );
    expect(srcs).toContain("https://example.com/assets/app.bundle.js");
  });

  it("ranks main/app bundles higher than vendor/chunk", () => {
    const scripts = extractScripts(sampleHtml, "https://example.com");
    const srcs = scripts.map((s) => s.src);
    // main and app should come before vendor and chunk
    const mainIdx = srcs.findIndex((s) => s.includes("main."));
    const appIdx = srcs.findIndex((s) => s.includes("app."));
    const vendorIdx = srcs.findIndex((s) => s.includes("vendor."));
    expect(mainIdx).toBeLessThan(vendorIdx);
    expect(appIdx).toBeLessThan(vendorIdx);
  });

  it("detects module and defer attributes", () => {
    const scripts = extractScripts(sampleHtml, "https://example.com");
    const mainScript = scripts.find((s) => s.src.includes("main."));
    expect(mainScript?.isModule).toBe(true);
    const appScript = scripts.find((s) => s.src.includes("app.bundle"));
    expect(appScript?.isDefer).toBe(true);
  });

  it("returns empty array for HTML with no scripts", () => {
    const scripts = extractScripts(
      "<html><body>Hello</body></html>",
      "https://example.com"
    );
    expect(scripts).toEqual([]);
  });
});

describe("extractTitle", () => {
  it("extracts the page title", () => {
    expect(extractTitle(sampleHtml)).toBe("My Test App");
  });

  it("returns null when no title", () => {
    expect(extractTitle("<html><body></body></html>")).toBeNull();
  });
});
