import { describe, it, expect } from "vitest";
import { analyzeCss, formatCssAnalysisForLLM } from "../src/css-analyzer.js";

describe("analyzeCss", () => {
  it("detects Tailwind CSS", () => {
    const css = `@tailwind base; @tailwind components; @tailwind utilities; .p-4 { padding: 1rem; }`;
    const result = analyzeCss(css);
    expect(result.designSystems).toContain("Tailwind CSS");
  });

  it("detects Bootstrap", () => {
    const css = `.btn-primary { background-color: #007bff; } .container-fluid { width: 100%; }`;
    const result = analyzeCss(css);
    expect(result.designSystems).toContain("Bootstrap");
  });

  it("detects styled-components", () => {
    const css = `[data-styled] { } .sc-abc123 { color: red; }`;
    const result = analyzeCss(css);
    expect(result.cssInJsRuntimes).toContain("styled-components");
  });

  it("detects Emotion", () => {
    const css = `[data-emotion="css"] { } .css-1a2b3c4 { color: blue; }`;
    const result = analyzeCss(css);
    expect(result.cssInJsRuntimes).toContain("Emotion");
  });

  it("extracts CSS custom properties", () => {
    const css = `:root { --primary-color: #333; --spacing-lg: 24px; --font-size-base: 16px; }`;
    const result = analyzeCss(css);
    expect(result.themeVariables).toContain("--primary-color");
    expect(result.themeVariables).toContain("--spacing-lg");
    expect(result.themeVariables).toContain("--font-size-base");
  });

  it("extracts breakpoints", () => {
    const css = `@media (min-width: 768px) { .col { width: 50%; } } @media (max-width: 1200px) { .col { width: 100%; } }`;
    const result = analyzeCss(css);
    expect(result.breakpoints).toHaveLength(2);
    expect(result.breakpoints[0]).toContain("768px");
  });

  it("extracts font stacks", () => {
    const css = `body { font-family: "Inter", -apple-system, sans-serif; } h1 { font-family: "Georgia", serif; }`;
    const result = analyzeCss(css);
    expect(result.fontStacks).toHaveLength(2);
    expect(result.fontStacks[0]).toContain("Inter");
  });

  it("returns empty for non-matching CSS", () => {
    const css = `.simple { color: red; margin: 0; }`;
    const result = analyzeCss(css);
    expect(result.designSystems).toHaveLength(0);
    expect(result.cssInJsRuntimes).toHaveLength(0);
  });
});

describe("formatCssAnalysisForLLM", () => {
  it("formats non-empty analysis", () => {
    const analysis = analyzeCss(`@tailwind base; :root { --primary: blue; } @media (min-width: 768px) {}`);
    const text = formatCssAnalysisForLLM(analysis);
    expect(text).toContain("Tailwind CSS");
    expect(text).toContain("--primary");
  });

  it("returns empty for empty analysis", () => {
    const analysis = analyzeCss(`.x { color: red; }`);
    const text = formatCssAnalysisForLLM(analysis);
    expect(text).toBe("");
  });
});
