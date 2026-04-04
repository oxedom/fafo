import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const prompts = JSON.parse(readFileSync(join(__dirname, "prompts.json"), "utf-8"));

export function getApiKey(required = true): string {
  const key = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
  if (!key && required) {
    throw new Error(
      "OPENAI_API_KEY is not set. Create a .env file with OPENAI_API_KEY=sk-..."
    );
  }
  return key || "";
}

export const DEFAULT_MODEL = "gpt-4.1";
export const DEFAULT_PROMPT: string = prompts.default;
export const PROMPT_PRESETS: Record<string, string> = prompts.presets;

export const DEFAULT_CONCURRENCY = 5;
export const DEFAULT_MAX_BUNDLE_SIZE_KB = 512;
export const DEFAULT_MAX_BUNDLES = 5;
export const DEFAULT_TIMEOUT_MS = 15000;
export const MAX_TOTAL_CHARS = 120_000;
