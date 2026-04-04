import { describe, it, expect } from "vitest";
import { extractHtmlMetadata, formatHtmlMetadataForLLM } from "../src/parser.js";

const BASE_URL = "https://example.com";

describe("extractHtmlMetadata", () => {
  it("extracts generator meta tag", () => {
    const html = `<html><head><meta name="generator" content="Next.js"></head><body></body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.generator).toBe("Next.js");
  });

  it("extracts CSP meta tag", () => {
    const html = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'"></head><body></body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.cspMeta).toBe("default-src 'self'");
  });

  it("extracts OpenGraph tags", () => {
    const html = `<html><head>
      <meta property="og:title" content="My App">
      <meta property="og:description" content="Cool app">
    </head><body></body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.openGraph["og:title"]).toBe("My App");
    expect(meta.openGraph["og:description"]).toBe("Cool app");
  });

  it("extracts preconnect domains", () => {
    const html = `<html><head>
      <link rel="preconnect" href="https://api.example.com">
      <link rel="preconnect" href="https://cdn.example.com">
    </head><body></body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.preconnectDomains).toEqual([
      "https://api.example.com",
      "https://cdn.example.com",
    ]);
  });

  it("extracts prefetch URLs", () => {
    const html = `<html><head>
      <link rel="prefetch" href="/api/data.json">
      <link rel="preload" href="/fonts/main.woff2">
    </head><body></body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.prefetchUrls).toHaveLength(2);
    expect(meta.prefetchUrls[0]).toContain("data.json");
  });

  it("extracts __NEXT_DATA__ inline scripts", () => {
    const html = `<html><head></head><body>
      <script>window.__NEXT_DATA__ = {"props":{"pageProps":{"apiUrl":"https://api.example.com/v1"}}}</script>
    </body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.inlineScripts).toHaveLength(1);
    expect(meta.inlineScripts[0].type).toBe("next-data");
    expect(meta.inlineScripts[0].extractedUrls).toContain("https://api.example.com/v1");
  });

  it("extracts config inline scripts with URLs", () => {
    const html = `<html><head></head><body>
      <script>window.CONFIG = { apiBase: "https://api.myapp.com", debug: false }</script>
    </body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.inlineScripts).toHaveLength(1);
    expect(meta.inlineScripts[0].type).toBe("config");
    expect(meta.inlineScripts[0].extractedUrls).toContain("https://api.myapp.com");
  });

  it("skips analytics inline scripts", () => {
    const html = `<html><head></head><body>
      <script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments)} gtag('js', new Date());</script>
    </body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.inlineScripts).toHaveLength(0);
  });

  it("skips trivial inline scripts", () => {
    const html = `<html><head></head><body><script>var x = 1;</script></body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.inlineScripts).toHaveLength(0);
  });

  it("returns empty metadata for bare HTML", () => {
    const html = `<html><head></head><body></body></html>`;
    const meta = extractHtmlMetadata(html, BASE_URL);
    expect(meta.generator).toBeNull();
    expect(meta.cspMeta).toBeNull();
    expect(meta.openGraph).toEqual({});
    expect(meta.inlineScripts).toHaveLength(0);
    expect(meta.preconnectDomains).toHaveLength(0);
    expect(meta.prefetchUrls).toHaveLength(0);
  });
});

describe("formatHtmlMetadataForLLM", () => {
  it("formats metadata with content", () => {
    const meta = extractHtmlMetadata(
      `<html><head><meta name="generator" content="Vite"><link rel="preconnect" href="https://api.test.com"></head><body></body></html>`,
      BASE_URL
    );
    const text = formatHtmlMetadataForLLM(meta);
    expect(text).toContain("Generator: Vite");
    expect(text).toContain("Preconnect domains: https://api.test.com");
  });

  it("returns empty for bare HTML", () => {
    const meta = extractHtmlMetadata(`<html><head></head><body></body></html>`, BASE_URL);
    const text = formatHtmlMetadataForLLM(meta);
    expect(text).toBe("");
  });
});
