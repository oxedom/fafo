import jsBeautify from "js-beautify";
const { js_beautify } = jsBeautify;
import type { BundleContent } from "./types.js";
import { logVerbose } from "./utils/logger.js";

export interface CodeChunk {
  bundleUrl: string;
  index: number;
  totalChunks: number;
  content: string;
  charCount: number;
}

const BEAUTIFY_OPTIONS = {
  indent_size: 2,
  max_preserve_newlines: 2,
  end_with_newline: false,
  wrap_line_length: 120,
};

// ~4000 chars ≈ ~1000 tokens. Conservative to leave room for system prompt + response.
const DEFAULT_CHUNK_SIZE = 8000;
const DEFAULT_OVERLAP = 400;

/**
 * Takes raw bundle content → beautifies → splits into token-aware chunks
 * at code boundaries (function/class/block ends).
 */
export function chunkBundles(
  bundles: BundleContent[],
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP
): CodeChunk[] {
  const allChunks: CodeChunk[] = [];

  for (const bundle of bundles) {
    const beautified = beautify(bundle.content);
    const chunks = splitAtCodeBoundaries(beautified, chunkSize, overlap);

    logVerbose(
      `  Chunked ${bundle.url}: ${bundle.originalSizeBytes}B → ${chunks.length} chunks ` +
        `(beautified: ${beautified.length} chars)`
    );

    for (let i = 0; i < chunks.length; i++) {
      allChunks.push({
        bundleUrl: bundle.url,
        index: i,
        totalChunks: chunks.length,
        content: chunks[i],
        charCount: chunks[i].length,
      });
    }
  }

  return allChunks;
}

function beautify(code: string): string {
  try {
    return js_beautify(code, BEAUTIFY_OPTIONS);
  } catch {
    // If beautify fails on weird input, return as-is
    return code;
  }
}

/**
 * Split code into chunks at natural code boundaries (closing braces,
 * semicolons at end of lines, blank lines) rather than mid-statement.
 */
function splitAtCodeBoundaries(
  code: string,
  maxChars: number,
  overlap: number
): string[] {
  const lines = code.split("\n");
  const chunks: string[] = [];
  let currentLines: string[] = [];
  let currentSize = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineSize = line.length + 1; // +1 for newline

    if (currentSize + lineSize > maxChars && currentLines.length > 0) {
      // Find best split point: walk backward to find a boundary line
      const splitIdx = findBoundary(currentLines);
      const chunkLines = currentLines.slice(0, splitIdx + 1);
      chunks.push(chunkLines.join("\n"));

      // Overlap: keep some trailing lines for context continuity
      const overlapLines = getOverlapLines(currentLines, splitIdx, overlap);
      currentLines = [...overlapLines, line];
      currentSize = currentLines.reduce((s, l) => s + l.length + 1, 0);
    } else {
      currentLines.push(line);
      currentSize += lineSize;
    }
  }

  // Push remaining
  if (currentLines.length > 0) {
    const remaining = currentLines.join("\n").trim();
    if (remaining.length > 0) {
      chunks.push(remaining);
    }
  }

  return chunks;
}

/**
 * Walk backward from end of lines to find a good split boundary.
 * Prefers: closing braces, semicolons, blank lines.
 */
function findBoundary(lines: string[]): number {
  // Search last 30% of lines for a good boundary
  const searchStart = Math.max(0, Math.floor(lines.length * 0.7));

  for (let i = lines.length - 1; i >= searchStart; i--) {
    const trimmed = lines[i].trim();
    if (
      trimmed === "}" ||
      trimmed === "};" ||
      trimmed === "});" ||
      trimmed === "}," ||
      trimmed === "" ||
      trimmed.endsWith(";") ||
      trimmed.endsWith("}")
    ) {
      return i;
    }
  }

  // No good boundary found, split at end
  return lines.length - 1;
}

function getOverlapLines(
  lines: string[],
  splitIdx: number,
  overlapChars: number
): string[] {
  const overlapLines: string[] = [];
  let chars = 0;

  for (let i = splitIdx; i >= 0 && chars < overlapChars; i--) {
    overlapLines.unshift(lines[i]);
    chars += lines[i].length + 1;
  }

  return overlapLines;
}
