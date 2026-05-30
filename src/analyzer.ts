import OpenAI from "openai";
import pLimit from "p-limit";
import type { AnalysisResult, Mode } from "./types.js";
import type { CodeChunk } from "./chunker.js";
import type { DistilledBundle } from "./distiller.js";
import { formatDistilledForLLM } from "./distiller.js";
import { logVerbose } from "./utils/logger.js";
import { DISTILLED_ONLY_THRESHOLD, MAP_CONCURRENCY } from "./config.js";

// Reasoning models (gpt-5.x, o1, o3, o4) reject custom temperature and consume
// part of max_completion_tokens for internal reasoning before producing output.
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/i.test(model);
}

function mapResponseFormat(mode: Mode) {
  return {
    type: "json_schema" as const,
    json_schema: { name: "chunk_analysis", strict: true, schema: mode.schema.map },
  };
}

function reduceResponseFormat(mode: Mode) {
  return {
    type: "json_schema" as const,
    json_schema: { name: "analysis_result", schema: mode.schema.reduce },
  };
}

// The array-typed property names declared in a schema's `properties`.
function arrayFields(schema: Record<string, unknown>): string[] {
  const props = (schema?.properties ?? {}) as Record<string, { type?: string }>;
  return Object.keys(props).filter((k) => props[k]?.type === "array");
}

export async function analyzeChunked(
  chunks: CodeChunk[],
  model: string,
  mode: Mode,
  apiKey: string,
  distilledBundles?: DistilledBundle[],
  baseUrl?: string,
  extraContext?: string
): Promise<AnalysisResult> {
  const client = new OpenAI({ apiKey, ...(baseUrl && { baseURL: baseUrl }) });

  // Skip MAP phase if distilled data is compact enough.
  if (distilledBundles && distilledBundles.length > 0) {
    const distilledText = distilledBundles.map(formatDistilledForLLM).join("\n\n");
    if (distilledText.length < DISTILLED_ONLY_THRESHOLD) {
      logVerbose(`  Distilled data is ${distilledText.length} chars — distilled-only mode (skipping MAP phase)`);
      return reduceResults(client, null, model, mode, distilledBundles, extraContext);
    }
  }

  logVerbose(`  Map phase: analyzing ${chunks.length} chunks with ${model}...`);
  const limit = pLimit(MAP_CONCURRENCY);
  const chunkResults = await Promise.all(
    chunks.map((chunk) => limit(() => analyzeChunk(client, chunk, model, mode)))
  );

  const validResults = chunkResults.filter(
    (r): r is Record<string, string[]> => r !== null
  );
  logVerbose(`  Map phase complete: ${validResults.length}/${chunks.length} chunks produced results`);

  if (validResults.length === 0 && (!distilledBundles || distilledBundles.length === 0)) {
    return emptyResult("No chunks produced analysis results");
  }

  logVerbose(`  Reduce phase: merging findings...`);
  const merged = mergeChunkResults(validResults, mode);
  return reduceResults(client, merged, model, mode, distilledBundles, extraContext);
}

async function analyzeChunk(
  client: OpenAI,
  chunk: CodeChunk,
  model: string,
  mode: Mode
): Promise<Record<string, string[]> | null> {
  const userMessage = `Bundle: ${chunk.bundleUrl} (chunk ${chunk.index + 1}/${chunk.totalChunks})\n\n${chunk.content}`;
  logVerbose(`    Analyzing chunk ${chunk.index + 1}/${chunk.totalChunks} of ${chunk.bundleUrl} (${chunk.charCount} chars)`);

  try {
    const reasoning = isReasoningModel(model);
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: mode.prompts.map },
        { role: "user", content: userMessage },
      ],
      response_format: mapResponseFormat(mode),
      ...(reasoning ? {} : { temperature: 0.1 }),
      max_completion_tokens: reasoning ? 6000 : 1500,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const out: Record<string, string[]> = {};
    for (const field of arrayFields(mode.schema.map)) {
      out[field] = Array.isArray(parsed[field]) ? parsed[field] : [];
    }
    return out;
  } catch (err) {
    logVerbose(`    Chunk ${chunk.index + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function mergeChunkResults(results: Record<string, string[]>[], mode: Mode): string {
  const merged: Record<string, string[]> = {};
  for (const field of arrayFields(mode.schema.map)) {
    const all = dedupe(results.flatMap((r) => r[field] || []));
    merged[field] = field === "interestingStrings" ? all.slice(0, 100) : all;
  }
  return JSON.stringify(merged, null, 2);
}

async function reduceResults(
  client: OpenAI,
  mergedFindings: string | null,
  model: string,
  mode: Mode,
  distilledBundles?: DistilledBundle[],
  extraContext?: string
): Promise<AnalysisResult> {
  let userMessage = mode.prompts.user;

  if (extraContext) {
    userMessage += `\n\n${extraContext}`;
  }

  if (distilledBundles && distilledBundles.length > 0) {
    userMessage += "\n\n=== PRE-EXTRACTED DATA (ground truth — extracted via regex, more reliable than LLM inference) ===\n";
    for (const d of distilledBundles) {
      userMessage += "\n" + formatDistilledForLLM(d) + "\n";
    }
    userMessage += "\n=== END PRE-EXTRACTED DATA ===\n";
  }

  if (mergedFindings) {
    userMessage += `\n\nMerged LLM findings from all chunks:\n${mergedFindings}`;
  }

  logVerbose(`  Reduce: sending ${userMessage.length} chars to ${model}`);

  try {
    const reasoning = isReasoningModel(model);
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: mode.prompts.reduce },
        { role: "user", content: userMessage },
      ],
      response_format: reduceResponseFormat(mode),
      ...(reasoning ? {} : { temperature: 0.2 }),
      max_completion_tokens: reasoning ? 12000 : 3000,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    return { ...parsed, rawResponse: raw };
  } catch {
    return emptyResult("Failed to parse reduce-phase LLM response");
  }
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  return arr.filter((item) => {
    const key = item.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function emptyResult(description: string): AnalysisResult {
  return { description, rawResponse: "" };
}
