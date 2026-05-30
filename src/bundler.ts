import type { ScriptInfo, BundleContent } from "./types.js";
import { logVerbose } from "./utils/logger.js";
import { withRetry } from "./utils/retry.js";

export async function fetchBundles(
  scripts: ScriptInfo[],
  maxBundles: number,
  maxSizeKb: number,
  timeoutMs: number
): Promise<BundleContent[]> {
  const toFetch = scripts.slice(0, maxBundles);
  const maxBytes = maxSizeKb * 1024;

  const results: BundleContent[] = [];

  for (const script of toFetch) {
    try {
      const content = await withRetry(() => fetchBundle(script.src, maxBytes, timeoutMs));
      results.push(content);
    } catch (err) {
      logVerbose(
        `Failed to fetch bundle ${script.src}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return results;
}

async function fetchBundle(
  url: string,
  maxBytes: number,
  timeoutMs: number
): Promise<BundleContent> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; fafo/0.1; +https://github.com/oxedom/fafo)",
      Accept: "*/*",
      "Accept-Encoding": "gzip, deflate, br",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const text = await response.text();
  const originalSize = Buffer.byteLength(text, "utf8");
  const truncated = originalSize > maxBytes;

  let content = text;
  if (truncated) {
    content = truncateAtBoundary(text, maxBytes);
  }

  return {
    url,
    truncated,
    originalSizeBytes: originalSize,
    content,
  };
}

export function truncateAtBoundary(text: string, maxBytes: number): string {
  // Multi-position sampling: take from beginning, middle, and end
  // This captures framework bootstrap (start), app logic (middle), and data/translations (end)
  const totalLen = text.length;

  if (totalLen <= maxBytes) return text;

  // Split budget: 45% start, 25% middle, 30% end
  const startBudget = Math.floor(maxBytes * 0.45);
  const middleBudget = Math.floor(maxBytes * 0.25);
  const endBudget = maxBytes - startBudget - middleBudget;

  const startSection = cutAtBoundary(text, 0, startBudget);
  const middleOffset = Math.floor((totalLen - middleBudget) / 2);
  const middleSection = cutAtBoundary(text, middleOffset, middleBudget);
  const endOffset = totalLen - endBudget;
  const endSection = cutAtBoundary(text, endOffset, endBudget);

  return [
    startSection,
    `\n// ... [gap: ${middleOffset - startBudget} chars skipped] ...\n`,
    middleSection,
    `\n// ... [gap: ${endOffset - middleOffset - middleBudget} chars skipped] ...\n`,
    endSection,
  ].join("");
}

function cutAtBoundary(text: string, offset: number, length: number): string {
  let slice = text.slice(offset, offset + length);

  // Trim to a clean boundary at the end
  const lastNewline = slice.lastIndexOf("\n");
  const lastSemicolon = slice.lastIndexOf(";");
  const boundary = Math.max(lastNewline, lastSemicolon);

  if (boundary > length * 0.8) {
    slice = slice.slice(0, boundary + 1);
  }

  // Trim to a clean boundary at the start (skip partial first line if not at offset 0)
  if (offset > 0) {
    const firstNewline = slice.indexOf("\n");
    if (firstNewline > 0 && firstNewline < 200) {
      slice = slice.slice(firstNewline + 1);
    }
  }

  return slice;
}
