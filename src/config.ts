import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import type { Mode } from "./types.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Shared, editable defaults -------------------------------------------
export const DEFAULT_MODEL = "gpt-4.1";
export const DEFAULT_CONCURRENCY = 5;
export const DEFAULT_MAX_BUNDLE_SIZE_KB = 512;
export const DEFAULT_MAX_BUNDLES = 5;
export const DEFAULT_TIMEOUT_MS = 15000;
export const DEFAULT_SOURCE_MAPS = false;
export const DEFAULT_VERBOSE = false;

// Internal analysis knobs
export const MAX_TOTAL_CHARS = 120_000;
export const MAP_CONCURRENCY = 5;
// If distilled data is under this size, skip MAP phase and use distilled-only mode
export const DISTILLED_ONLY_THRESHOLD = 60_000;
// Cap on the unbounded `interestingStrings` field after merging chunk results,
// to keep the reduce-phase prompt from exploding. Other merged fields are not capped.
export const INTERESTING_STRINGS_CAP = 100;

// --- API key -------------------------------------------------------------
export function getApiKey(required = true): string {
  const key = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!key && required) {
    throw new Error(
      "OPENAI_API_KEY is not set. Create a .env file with OPENAI_API_KEY=sk-..."
    );
  }
  return key || "";
}

// --- Modes ---------------------------------------------------------------
const modes: Record<string, Mode> = JSON.parse(
  readFileSync(join(__dirname, "modes.json"), "utf-8")
);

export function listModes(): string[] {
  return Object.keys(modes);
}

export function validateMode(name: string, raw: Mode): void {
  const missing: string[] = [];
  if (!raw || typeof raw !== "object") {
    throw new Error(`Mode "${name}" is not a valid object in modes.json`);
  }
  if (!raw.description) missing.push("description");
  if (!raw.prompts?.map) missing.push("prompts.map");
  if (!raw.prompts?.reduce) missing.push("prompts.reduce");
  if (!raw.prompts?.user) missing.push("prompts.user");
  if (!raw.schema?.map) missing.push("schema.map");
  if (!raw.schema?.reduce) missing.push("schema.reduce");
  if (missing.length > 0) {
    throw new Error(
      `Mode "${name}" in modes.json is missing required field(s): ${missing.join(", ")}`
    );
  }
}

export function resolveMode(name: string): Mode {
  const raw = modes[name];
  if (!raw) {
    throw new Error(
      `Unknown mode "${name}". Available modes: ${listModes().join(", ")}`
    );
  }
  validateMode(name, raw);
  return raw;
}

// --- Legacy exports (still used by old analyzer/cli until Task 3) ---------
const legacyPrompts = JSON.parse(
  readFileSync(join(__dirname, "prompts.json"), "utf-8")
);
export const DEFAULT_PROMPT: string = legacyPrompts.default;
export const PROMPT_PRESETS: Record<string, string> = legacyPrompts.presets;
