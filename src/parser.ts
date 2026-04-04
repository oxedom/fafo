import * as cheerio from "cheerio";
import { resolveUrl } from "./utils/url.js";
import type { ScriptInfo, HtmlMetadata, InlineScriptData } from "./types.js";

const EXCLUDED_PATTERNS = [
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /gtag\/js/,
  /fbevents/,
  /facebook\.net/,
  /hotjar\.com/,
  /segment\.com/,
  /intercom/,
  /sentry/,
  /datadog/,
  /cdn\.jsdelivr\.net/,
  /cdnjs\.cloudflare\.com/,
  /unpkg\.com/,
  /polyfill\.io/,
];

const VENDOR_PATTERNS = [
  /vendor/i,
  /chunk-vendors/i,
  /polyfill/i,
  /webpack-runtime/i,
  /runtime~/i,
  /framework\./i,
];

const MAIN_BUNDLE_PATTERNS = [
  /main[.\-]/i,
  /app[.\-]/i,
  /index[.\-]/i,
  /entry[.\-]/i,
  /bundle[.\-]/i,
];

export function extractScripts(html: string, baseUrl: string): ScriptInfo[] {
  const $ = cheerio.load(html);
  const scripts: ScriptInfo[] = [];

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;

    const resolvedUrl = resolveUrl(src, baseUrl);

    // Skip data URIs and blob URLs
    if (resolvedUrl.startsWith("data:") || resolvedUrl.startsWith("blob:"))
      return;

    // Skip known analytics/tracking/CDN scripts
    if (EXCLUDED_PATTERNS.some((p) => p.test(resolvedUrl))) return;

    scripts.push({
      src: resolvedUrl,
      isModule: $(el).attr("type") === "module",
      isAsync: $(el).attr("async") !== undefined,
      isDefer: $(el).attr("defer") !== undefined,
    });
  });

  return rankScripts(scripts);
}

const EXCLUDED_STYLESHEET_PATTERNS = [
  /fonts\.googleapis\.com/,
  /use\.fontawesome\.com/,
  /cdn\.jsdelivr\.net/,
  /cdnjs\.cloudflare\.com/,
  /unpkg\.com/,
];

export function extractStylesheets(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];

  $('link[rel="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const resolved = resolveUrl(href, baseUrl);
    if (resolved.startsWith("data:") || resolved.startsWith("blob:")) return;
    if (EXCLUDED_STYLESHEET_PATTERNS.some((p) => p.test(resolved))) return;

    urls.push(resolved);
  });

  return urls;
}

export function extractTitle(html: string): string | null {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  return title || null;
}

function rankScripts(scripts: ScriptInfo[]): ScriptInfo[] {
  return scripts.sort((a, b) => {
    const aScore = scoreScript(a);
    const bScore = scoreScript(b);
    return bScore - aScore;
  });
}

function scoreScript(script: ScriptInfo): number {
  let score = 0;

  // Boost main bundle patterns
  if (MAIN_BUNDLE_PATTERNS.some((p) => p.test(script.src))) score += 10;

  // Boost module scripts
  if (script.isModule) score += 3;

  // Penalize vendor patterns
  if (VENDOR_PATTERNS.some((p) => p.test(script.src))) score -= 10;

  return score;
}

const INLINE_ANALYTICS_PATTERNS = [
  /google-analytics/i,
  /googletagmanager/i,
  /gtag\s*\(/,
  /fbq\s*\(/,
  /hotjar/i,
  /datadog/i,
  /sentry/i,
];

const MAX_INLINE_CONTENT = 5000;
const URL_REGEX = /https?:\/\/[^\s"'`<>)\]},]+/g;

export function extractHtmlMetadata(html: string, baseUrl: string): HtmlMetadata {
  const $ = cheerio.load(html);

  // Meta tags
  const generator = $('meta[name="generator"]').attr("content") || null;
  const cspMeta = $('meta[http-equiv="Content-Security-Policy"]').attr("content") || null;

  const openGraph: Record<string, string> = {};
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property");
    const content = $(el).attr("content");
    if (prop && content) openGraph[prop] = content;
  });

  // Inline scripts
  const inlineScripts: InlineScriptData[] = [];
  $("script:not([src])").each((_, el) => {
    const content = $(el).html() || "";
    if (content.length < 20) return;

    // Skip analytics snippets
    if (INLINE_ANALYTICS_PATTERNS.some((p) => p.test(content))) return;

    const truncated = content.slice(0, MAX_INLINE_CONTENT);
    const extractedUrls = [...new Set((truncated.match(URL_REGEX) || []))];
    const extractedKeys = extractConfigKeys(truncated);

    let type: InlineScriptData["type"] = "generic";
    if (/__NEXT_DATA__/.test(content)) type = "next-data";
    else if (/__INITIAL_STATE__|__STATE__/.test(content)) type = "initial-state";
    else if (/window\.(CONFIG|ENV|__CONFIG__|__ENV__)/.test(content)) type = "config";

    // Skip generic scripts with no interesting data
    if (type === "generic" && extractedUrls.length === 0 && extractedKeys.length === 0) return;

    inlineScripts.push({ type, content: truncated, extractedUrls, extractedKeys });
  });

  // Link hints
  const preconnectDomains: string[] = [];
  $('link[rel="preconnect"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) preconnectDomains.push(href);
  });

  const prefetchUrls: string[] = [];
  $('link[rel="prefetch"], link[rel="preload"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) prefetchUrls.push(resolveUrl(href, baseUrl));
  });

  return { generator, cspMeta, openGraph, inlineScripts, preconnectDomains, prefetchUrls };
}

function extractConfigKeys(content: string): string[] {
  const keys: string[] = [];

  // Environment variable names
  const envMatches = content.match(/(?:process\.env|import\.meta\.env)\.(\w+)/g);
  if (envMatches) keys.push(...envMatches);

  // Feature flag patterns
  const flagMatches = content.match(/["'](?:feature_|ff_|flag_)\w+["']/gi);
  if (flagMatches) keys.push(...flagMatches.map((m) => m.slice(1, -1)));

  return [...new Set(keys)];
}

export function formatHtmlMetadataForLLM(meta: HtmlMetadata): string {
  const lines: string[] = ["--- HTML Metadata ---"];

  if (meta.generator) lines.push(`Generator: ${meta.generator}`);
  if (meta.cspMeta) lines.push(`CSP (meta): ${meta.cspMeta}`);

  const ogEntries = Object.entries(meta.openGraph);
  if (ogEntries.length > 0) {
    lines.push(`OpenGraph: ${ogEntries.map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  if (meta.preconnectDomains.length > 0) {
    lines.push(`Preconnect domains: ${meta.preconnectDomains.join(", ")}`);
  }

  if (meta.prefetchUrls.length > 0) {
    lines.push(`Prefetch URLs: ${meta.prefetchUrls.join(", ")}`);
  }

  for (const script of meta.inlineScripts) {
    lines.push(`Inline script (${script.type}):`);
    if (script.extractedUrls.length > 0) {
      lines.push(`  URLs: ${script.extractedUrls.join(", ")}`);
    }
    if (script.extractedKeys.length > 0) {
      lines.push(`  Keys: ${script.extractedKeys.join(", ")}`);
    }
  }

  return lines.length > 1 ? lines.join("\n") : "";
}
