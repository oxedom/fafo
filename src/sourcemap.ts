import { logVerbose } from "./utils/logger.js";
import { withRetry } from "./utils/retry.js";

export interface SourceMapData {
  url: string;
  originalFiles: string[];
  moduleStructure: string[];
  hasSourceContent: boolean;
}

const SOURCE_MAP_REGEX = /\/\/[#@]\s*sourceMappingURL=(\S+)\s*$/m;

export function extractSourceMapUrl(
  bundleContent: string,
  bundleUrl: string
): string | null {
  const match = bundleContent.match(SOURCE_MAP_REGEX);
  if (!match) return null;

  const raw = match[1];

  // Skip data URIs
  if (raw.startsWith("data:")) return null;

  // Resolve relative URLs
  try {
    return new URL(raw, bundleUrl).href;
  } catch {
    return null;
  }
}

export async function fetchAndParseSourceMap(
  mapUrl: string,
  timeoutMs: number
): Promise<SourceMapData | null> {
  try {
    const response = await withRetry(async () => {
      const res = await fetch(mapUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; fafo/0.1; +https://github.com/oxedom/fafo)",
          "Accept-Encoding": "gzip, deflate, br",
        },
        redirect: "follow",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${mapUrl}`);
      }
      return res;
    });

    const text = await response.text();
    const parsed = JSON.parse(text);

    if (parsed.version !== 3 || !Array.isArray(parsed.sources)) {
      return null;
    }

    const cleanedSources = cleanSourcePaths(parsed.sources);

    return {
      url: mapUrl,
      originalFiles: cleanedSources,
      moduleStructure: buildModuleStructure(cleanedSources),
      hasSourceContent: Array.isArray(parsed.sourcesContent) && parsed.sourcesContent.length > 0,
    };
  } catch (err) {
    logVerbose(
      `    Source map fetch failed: ${mapUrl} — ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

function cleanSourcePaths(sources: string[]): string[] {
  return sources
    .map((s) => {
      // Strip webpack:// and similar prefixes
      let cleaned = s
        .replace(/^webpack:\/\/\//, "")
        .replace(/^webpack:\/\/[^/]*\//, "")
        .replace(/^\.\//,  "");

      return cleaned;
    })
    .filter((s) => {
      // Filter out noise
      if (!s || s.startsWith("<")) return false;
      if (s.includes("webpack/runtime")) return false;
      return true;
    });
}

function buildModuleStructure(files: string[]): string[] {
  const dirs = new Set<string>();

  for (const file of files) {
    const parts = file.split("/");
    if (parts.length < 2) continue;

    // For node_modules, capture package name
    const nmIdx = parts.indexOf("node_modules");
    if (nmIdx >= 0 && parts.length > nmIdx + 1) {
      const pkg = parts[nmIdx + 1].startsWith("@")
        ? `${parts[nmIdx + 1]}/${parts[nmIdx + 2] || ""}`
        : parts[nmIdx + 1];
      dirs.add(`node_modules/${pkg}`);
    } else {
      // App source: capture top-level directory
      dirs.add(parts[0]);
    }
  }

  return [...dirs].sort();
}

export function formatSourceMapForLLM(data: SourceMapData): string {
  const lines: string[] = [`--- Source Map: ${data.url} ---`];
  lines.push(`Original files: ${data.originalFiles.length}`);
  lines.push(`Has source content: ${data.hasSourceContent}`);

  if (data.moduleStructure.length > 0) {
    lines.push(`Module structure:`);
    for (const mod of data.moduleStructure.slice(0, 30)) {
      lines.push(`  ${mod}`);
    }
  }

  // List app source files (non-node_modules)
  const appFiles = data.originalFiles.filter((f) => !f.includes("node_modules")).slice(0, 50);
  if (appFiles.length > 0) {
    lines.push(`App source files (${appFiles.length}):`);
    for (const f of appFiles) {
      lines.push(`  ${f}`);
    }
  }

  return lines.join("\n");
}
