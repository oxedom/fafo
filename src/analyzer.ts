import OpenAI from "openai";
import pLimit from "p-limit";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { AnalysisResult } from "./types.js";
import type { CodeChunk } from "./chunker.js";
import type { DistilledBundle } from "./distiller.js";
import { formatDistilledForLLM } from "./distiller.js";
import { logVerbose } from "./utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prompts = JSON.parse(readFileSync(join(__dirname, "prompts.json"), "utf-8"));

const MAP_SYSTEM_PROMPT: string = prompts.system.map;
const REDUCE_SYSTEM_PROMPT: string = prompts.system.reduce;

interface ChunkAnalysis {
  stack: string[];
  endpoints: string[];
  routes: string[];
  authMechanisms: string[];
  securityFindings: string[];
  appFunctionality: string[];
  interestingStrings: string[];
}

const MAP_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "chunk_analysis",
    strict: true,
    schema: {
      type: "object" as const,
      properties: {
        stack: { type: "array" as const, items: { type: "string" as const } },
        endpoints: { type: "array" as const, items: { type: "string" as const } },
        routes: { type: "array" as const, items: { type: "string" as const } },
        authMechanisms: { type: "array" as const, items: { type: "string" as const } },
        securityFindings: { type: "array" as const, items: { type: "string" as const } },
        appFunctionality: { type: "array" as const, items: { type: "string" as const } },
        interestingStrings: { type: "array" as const, items: { type: "string" as const } },
      },
      required: ["stack", "endpoints", "routes", "authMechanisms", "securityFindings", "appFunctionality", "interestingStrings"],
      additionalProperties: false,
    },
  },
};

const REDUCE_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "analysis_result",
    schema: {
      type: "object" as const,
      properties: {
        stack: { type: "array" as const, items: { type: "string" as const } },
        versions: { type: "object" as const, additionalProperties: { type: "string" as const } },
        description: { type: "string" as const },
        endpoints: { type: "array" as const, items: { type: "string" as const } },
        routes: { type: "array" as const, items: { type: "string" as const } },
        authMechanisms: { type: "array" as const, items: { type: "string" as const } },
        securityFindings: { type: "array" as const, items: { type: "string" as const } },
        appFunctionality: { type: "array" as const, items: { type: "string" as const } },
      },
      required: ["stack", "versions", "description", "endpoints", "routes", "authMechanisms", "securityFindings", "appFunctionality"],
    },
  },
};

const MAP_CONCURRENCY = 5;

// If distilled data is under this size, skip MAP phase and use distilled-only mode
const DISTILLED_ONLY_THRESHOLD = 60_000;

export async function analyzeChunked(
  chunks: CodeChunk[],
  model: string,
  prompt: string,
  apiKey: string,
  distilledBundles?: DistilledBundle[],
  baseUrl?: string,
  extraContext?: string
): Promise<AnalysisResult> {
  const client = new OpenAI({
    apiKey,
    ...(baseUrl && { baseURL: baseUrl }),
  });

  // Check if distilled data is compact enough to skip MAP phase
  if (distilledBundles && distilledBundles.length > 0) {
    const distilledText = distilledBundles.map(formatDistilledForLLM).join("\n\n");
    if (distilledText.length < DISTILLED_ONLY_THRESHOLD) {
      logVerbose(`  Distilled data is ${distilledText.length} chars — using distilled-only mode (skipping MAP phase)`);
      return reduceResults(client, null, model, prompt, distilledBundles, extraContext);
    }
  }

  // MAP phase: analyze each chunk independently (fallback for large bundles)
  logVerbose(`  Map phase: analyzing ${chunks.length} chunks with ${model}...`);
  const limit = pLimit(MAP_CONCURRENCY);
  const chunkResults = await Promise.all(
    chunks.map((chunk) =>
      limit(() => analyzeChunk(client, chunk, model))
    )
  );

  const validResults = chunkResults.filter(
    (r): r is ChunkAnalysis => r !== null
  );
  logVerbose(`  Map phase complete: ${validResults.length}/${chunks.length} chunks produced results`);

  if (validResults.length === 0 && (!distilledBundles || distilledBundles.length === 0)) {
    return emptyResult("No chunks produced analysis results");
  }

  // REDUCE phase: merge all chunk findings + distilled data
  logVerbose(`  Reduce phase: merging findings...`);
  const merged = mergeChunkResults(validResults);
  const result = await reduceResults(client, merged, model, prompt, distilledBundles, extraContext);

  return result;
}

async function analyzeChunk(
  client: OpenAI,
  chunk: CodeChunk,
  model: string
): Promise<ChunkAnalysis | null> {
  const userMessage = `Bundle: ${chunk.bundleUrl} (chunk ${chunk.index + 1}/${chunk.totalChunks})\n\n${chunk.content}`;

  logVerbose(`    Analyzing chunk ${chunk.index + 1}/${chunk.totalChunks} of ${chunk.bundleUrl} (${chunk.charCount} chars)`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: MAP_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: MAP_RESPONSE_FORMAT,
      temperature: 0.1,
      max_completion_tokens: 1500,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    return {
      stack: parsed.stack || [],
      endpoints: parsed.endpoints || [],
      routes: parsed.routes || [],
      authMechanisms: parsed.authMechanisms || [],
      securityFindings: parsed.securityFindings || [],
      appFunctionality: parsed.appFunctionality || [],
      interestingStrings: parsed.interestingStrings || [],
    };
  } catch (err) {
    logVerbose(`    Chunk ${chunk.index + 1} failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function mergeChunkResults(results: ChunkAnalysis[]): string {
  const merged = {
    stack: dedupe(results.flatMap((r) => r.stack)),
    endpoints: dedupe(results.flatMap((r) => r.endpoints)),
    routes: dedupe(results.flatMap((r) => r.routes)),
    authMechanisms: dedupe(results.flatMap((r) => r.authMechanisms)),
    securityFindings: dedupe(results.flatMap((r) => r.securityFindings)),
    appFunctionality: dedupe(results.flatMap((r) => r.appFunctionality)),
    interestingStrings: dedupe(results.flatMap((r) => r.interestingStrings)).slice(0, 100),
  };

  return JSON.stringify(merged, null, 2);
}

async function reduceResults(
  client: OpenAI,
  mergedFindings: string | null,
  model: string,
  prompt: string,
  distilledBundles?: DistilledBundle[],
  extraContext?: string
): Promise<AnalysisResult> {
  let userMessage = prompt;

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
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: REDUCE_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: REDUCE_RESPONSE_FORMAT,
      temperature: 0.2,
      max_completion_tokens: 3000,
    });

    const raw = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);

    return {
      stack: parsed.stack || [],
      versions: parsed.versions || {},
      description: parsed.description || "Unable to determine",
      endpoints: parsed.endpoints || [],
      routes: parsed.routes || [],
      authMechanisms: parsed.authMechanisms || [],
      securityFindings: parsed.securityFindings || [],
      appFunctionality: parsed.appFunctionality || [],
      rawResponse: raw,
    };
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
  return {
    stack: [],
    versions: {},
    description,
    endpoints: [],
    routes: [],
    authMechanisms: [],
    securityFindings: [],
    appFunctionality: [],
    rawResponse: "",
  };
}
