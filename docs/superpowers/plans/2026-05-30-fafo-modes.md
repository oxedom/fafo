# fafo Mode-Driven Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `fafo` into a mode-driven CLI where each *mode* (`security`, `product`) is a self-contained research profile (own prompts + output schema) selected via a required `--mode` flag.

**Architecture:** A mode lives in `src/modes.json` (prompts + JSON output schemas only). Shared tuning lives in `src/config.ts` as editable defaults. `analyzer.ts` becomes schema-driven: it reads the selected mode's prompts and schemas, merges chunk findings generically over the schema's array fields, and returns a generic result object. The CLI collapses to `--input` + `--mode` (required) plus `--output`/`--json`/`--verbose`.

**Tech Stack:** TypeScript (ESM), commander, openai SDK, p-limit, vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-30-fafo-modes-design.md`

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/modes.json` | Mode definitions: `description`, `prompts{map,reduce,user}`, `schema{map,reduce}` | **Create** |
| `src/prompts.json` | Old flat prompts/presets | **Delete** (Task 5) |
| `src/css-analyzer.ts` | CSS stylesheet analysis | **Delete** (Task 1) |
| `tests/css-analyzer.test.ts` | CSS tests | **Delete** (Task 1) |
| `src/config.ts` | Shared defaults + mode loading/resolution | **Rewrite** |
| `src/types.ts` | `Mode`, generic `AnalysisResult`, `RunConfig`, `RunOutput`, `DomainResult` | **Modify** |
| `src/analyzer.ts` | Schema-driven map-reduce LLM analysis | **Rewrite** |
| `src/pipeline.ts` | Orchestration per domain (CSS removed, mode passed) | **Modify** |
| `src/cli.ts` | Commander program (new flags, mode resolution) | **Rewrite** |
| `tests/modes.test.ts` | Mode resolution/validation tests | **Create** |
| `tests/analyzer.test.ts` | Schema-driven analyzer tests | **Modify** |
| `tests/pipeline.test.ts` | Pipeline tests (mode-based) | **Modify** |
| `package.json` | name/bin → `fafo` | **Modify** (Task 6) |
| `README.md` | Two-flag usage, modes documentation | **Rewrite** (Task 6) |

**Task ordering rationale:** Task 1 (CSS removal) and Task 2 (modes foundation) are independent and leave the tree green. Task 3 is the irreducible core refactor — analyzer/pipeline/cli/types form a cycle through the `analyzeChunked` signature, so they change together. Tasks 5–6 are cleanup/rename.

---

## Task 1: Remove CSS analysis

CSS analysis is being cut. It's independent of the mode work, so remove it first to shrink `pipeline.ts` before the core refactor.

**Files:**
- Delete: `src/css-analyzer.ts`
- Delete: `tests/css-analyzer.test.ts`
- Modify: `src/types.ts` (remove `cssAnalysis` from `DomainResult`)
- Modify: `src/pipeline.ts` (remove all CSS usage)

- [ ] **Step 1: Delete the CSS files**

```bash
git rm src/css-analyzer.ts tests/css-analyzer.test.ts
```

- [ ] **Step 2: Remove `cssAnalysis` from `DomainResult` in `src/types.ts`**

Delete this line from the `DomainResult` interface (currently line 51):

```ts
  cssAnalysis: import("./css-analyzer.js").CssAnalysis | null;
```

- [ ] **Step 3: Remove CSS imports from `src/pipeline.ts`**

Delete these two import lines (currently lines 8-9):

```ts
import { analyzeCss, formatCssAnalysisForLLM } from "./css-analyzer.js";
import type { CssAnalysis } from "./css-analyzer.js";
```

- [ ] **Step 4: Remove the `extractStylesheets` usage from the parser import in `src/pipeline.ts`**

Change the parser import (currently line 7) from:

```ts
import { extractScripts, extractTitle, extractHtmlMetadata, formatHtmlMetadataForLLM, extractStylesheets } from "./parser.js";
```

to:

```ts
import { extractScripts, extractTitle, extractHtmlMetadata, formatHtmlMetadataForLLM } from "./parser.js";
```

- [ ] **Step 5: Remove stylesheet extraction and CSS analysis in `processDomain`**

In `src/pipeline.ts`, delete the `extractStylesheets` call and its log mention. Change (currently lines 100-102):

```ts
    const scripts = extractScripts(html, url);
    const stylesheetUrls = extractStylesheets(html, url);
    logVerbose(`  Found ${scripts.length} script(s), ${stylesheetUrls.length} stylesheet(s)`);
```

to:

```ts
    const scripts = extractScripts(html, url);
    logVerbose(`  Found ${scripts.length} script(s)`);
```

Then delete the entire "3b. Fetch and analyze CSS" block (currently lines 151-156):

```ts
    // 3b. Fetch and analyze CSS
    let cssAnalysis: CssAnalysis | null = null;
    if (stylesheetUrls.length > 0) {
      logVerbose(`  Analyzing ${stylesheetUrls.length} stylesheet(s)...`);
      cssAnalysis = await fetchAndAnalyzeCss(stylesheetUrls.slice(0, 3), opts.timeout);
    }
```

- [ ] **Step 6: Remove the CSS context line and `cssAnalysis` from all three return objects in `src/pipeline.ts`**

In the `contextParts` array (currently lines 185-190), delete this line:

```ts
      cssAnalysis ? formatCssAnalysisForLLM(cssAnalysis) : "",
```

Then remove the `cssAnalysis: ...,` property from **all three** `DomainResult` return objects in this file (the no-scripts return, the no-bundles return, the success return, and the catch/error return — search for `cssAnalysis:` and delete each occurrence).

- [ ] **Step 7: Delete the `fetchAndAnalyzeCss` helper from `src/pipeline.ts`**

Delete the entire `fetchAndAnalyzeCss` function at the bottom of the file (currently lines 250-298).

- [ ] **Step 8: Build to verify no dangling references**

Run: `npm run lint`
Expected: PASS (no TypeScript errors). If it reports an unused `CssAnalysis` or `cssAnalysis`, remove the remaining reference.

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: PASS (css-analyzer tests are gone; pipeline test does not assert `cssAnalysis`).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor: remove CSS analysis"
```

---

## Task 2: Modes foundation (additive)

Add the new `modes.json`, the `Mode` type, and config loading/resolution **without** touching the analyzer yet. The old `prompts.json` and `DEFAULT_PROMPT`/`PROMPT_PRESETS` stay for now so the tree keeps building.

**Files:**
- Create: `src/modes.json`
- Modify: `src/types.ts` (add `Mode` interface)
- Modify: `src/config.ts` (add defaults + mode loading/resolution; keep old exports)
- Test: `tests/modes.test.ts`

- [ ] **Step 1: Create `src/modes.json`**

```json
{
  "security": {
    "description": "Greybox recon — tech stack, API surface, auth mechanisms, security findings",
    "prompts": {
      "map": "You are a security-focused frontend analyst performing greybox reconnaissance on a web application's JavaScript bundle.\n\nYou will receive one chunk of a beautified JavaScript bundle. Analyze it and respond with a JSON object containing ONLY what you observe in THIS chunk:\n\n- \"stack\": technologies/frameworks detected with versions if visible (e.g. \"React 18.2.0\", \"Next.js\")\n- \"endpoints\": API endpoints found, include HTTP method if detectable (e.g. \"POST /api/auth/login\"). Look for fetch(), axios, XMLHttpRequest calls and extract the URL argument even if constructed from variables.\n- \"routes\": client-side routes/pages. ONLY report paths that appear in route definitions (e.g. createFileRoute('/settings'), createRoute({path: '/dashboard'}), <Route path=\"/login\">). Do NOT report component names as routes. Do NOT report framework catch-all patterns unless they clearly render user-facing pages.\n- \"authMechanisms\": authentication/authorization mechanisms (e.g. \"JWT in localStorage\", \"OAuth2\"). Note: Cloudflare beacon is analytics, NOT authentication.\n- \"securityFindings\": security observations in APPLICATION code only. Do NOT report framework internals (React's dangerouslySetInnerHTML property name, __REACT_DEVTOOLS_GLOBAL_HOOK__) as security findings.\n- \"appFunctionality\": high-level features/capabilities (e.g. \"file upload\", \"payment processing\")\n- \"interestingStrings\": notable strings — error messages, config keys, feature flags, env var names, test data (emails, phone numbers)\n\nFor each finding, include a brief evidence note in parentheses citing the actual code pattern you observed. Be specific. Skip empty arrays. Respond ONLY with valid JSON. No markdown, no code fences.",
      "reduce": "You are a security-focused frontend analyst. You will receive merged findings from analyzing a web application's JavaScript bundles.\n\nYou may also receive pre-extracted structured data (libraries, endpoints, routes, auth patterns) that was deterministically extracted from the code using regex — treat this as ground truth that is more reliable than LLM-inferred findings.\n\nSynthesize everything into a final comprehensive analysis. When pre-extracted data conflicts with LLM-inferred findings, prefer the pre-extracted data. Deduplicate, resolve conflicts, and produce a JSON object:\n\n- \"stack\": array of frontend technologies/frameworks detected\n- \"description\": 2-4 sentence description of what this application does and its purpose\n- \"endpoints\": array of API endpoints found, including HTTP method if detectable\n- \"routes\": array of client-side routes/pages the app exposes. Only actual navigable routes, not component names.\n- \"authMechanisms\": array describing authentication/authorization mechanisms\n- \"securityFindings\": array of potential security observations. Only application code, not framework internals.\n- \"appFunctionality\": array of high-level app features/capabilities identified\n\nFocus on what would be useful for a security audit. Be specific. Deduplicate similar entries. Respond ONLY with valid JSON. No markdown, no code fences.",
      "user": "Perform a greybox recon analysis of this web application. Identify the complete tech stack, map all API endpoints and routes, document auth mechanisms, and flag any security-relevant findings. Tech-stack and endpoint discovery are part of this recon — be thorough on both."
    },
    "schema": {
      "map": {
        "type": "object",
        "properties": {
          "stack": { "type": "array", "items": { "type": "string" } },
          "endpoints": { "type": "array", "items": { "type": "string" } },
          "routes": { "type": "array", "items": { "type": "string" } },
          "authMechanisms": { "type": "array", "items": { "type": "string" } },
          "securityFindings": { "type": "array", "items": { "type": "string" } },
          "appFunctionality": { "type": "array", "items": { "type": "string" } },
          "interestingStrings": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["stack", "endpoints", "routes", "authMechanisms", "securityFindings", "appFunctionality", "interestingStrings"],
        "additionalProperties": false
      },
      "reduce": {
        "type": "object",
        "properties": {
          "stack": { "type": "array", "items": { "type": "string" } },
          "description": { "type": "string" },
          "endpoints": { "type": "array", "items": { "type": "string" } },
          "routes": { "type": "array", "items": { "type": "string" } },
          "authMechanisms": { "type": "array", "items": { "type": "string" } },
          "securityFindings": { "type": "array", "items": { "type": "string" } },
          "appFunctionality": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["stack", "description", "endpoints", "routes", "authMechanisms", "securityFindings", "appFunctionality"]
      }
    }
  },
  "product": {
    "description": "Product reconstruction — features, user workflows, business entities, monetization",
    "prompts": {
      "map": "You are a product analyst reverse-engineering a web application's FEATURES from one chunk of its beautified JavaScript bundle. IGNORE security entirely. Respond with a JSON object containing ONLY what you observe in THIS chunk:\n\n- \"appFunctionality\": product features/capabilities. For each, cite evidence (component/function/state/store/query/mutation/i18n key names spotted in code). Be specific about what the feature does.\n- \"entities\": business objects/domain entities the code manipulates (e.g. \"Project\", \"Invoice\", \"Workout\"), with the evidence that revealed them.\n- \"interestingStrings\": notable user-facing strings, feature flags, plan/tier names, config keys, i18n keys.\n\nSkip empty arrays. Respond ONLY with valid JSON. No markdown, no code fences.",
      "reduce": "You are a product analyst. You will receive merged product findings from analyzing a web application's JavaScript bundles, plus possibly pre-extracted structured data (treat that as ground truth).\n\nSynthesize a DEEP product reconstruction. Produce a JSON object:\n\n- \"description\": 4-6 sentence plain-language explanation covering what the product is, who it's for, the primary user workflows (sign-up → onboard → core action → outcome), the main business entities and their relationships, monetization signals (plans, tiers, paywalls, quotas), and any user roles or permission levels detected.\n- \"appFunctionality\": the most important output. For each feature, a self-contained paragraph: \"<Feature name> — Evidence: <names spotted in code>. Inputs: <data/params/form fields>. Outputs: <data produced/persisted/rendered/sent>. Behavior: <what the user sees, what triggers it, step-by-step flow>. Logic: <branching, validation, limits, computed rules, gating>. Entities: <business objects>.\" Do NOT collapse features to one-word labels — write full engineering reconstructions.\n- \"entities\": business objects/domain entities and their relationships.\n- \"monetization\": pricing tiers, plans, paywalls, quotas, billing signals detected (empty array if none).\n- \"userRoles\": user roles or permission levels detected (empty array if none).\n- \"routes\": navigable client-side routes/pages the app exposes (not component names).\n\nRespond ONLY with valid JSON. No markdown, no code fences.",
      "user": "Reverse-engineer this web application's PRODUCT in depth. Figure out what the app actually does, how its features work, what the user can do with it, the business entities, the user workflows, and any monetization. Invest the most detail in the per-feature engineering reconstructions in \"appFunctionality\"."
    },
    "schema": {
      "map": {
        "type": "object",
        "properties": {
          "appFunctionality": { "type": "array", "items": { "type": "string" } },
          "entities": { "type": "array", "items": { "type": "string" } },
          "interestingStrings": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["appFunctionality", "entities", "interestingStrings"],
        "additionalProperties": false
      },
      "reduce": {
        "type": "object",
        "properties": {
          "description": { "type": "string" },
          "appFunctionality": { "type": "array", "items": { "type": "string" } },
          "entities": { "type": "array", "items": { "type": "string" } },
          "monetization": { "type": "array", "items": { "type": "string" } },
          "userRoles": { "type": "array", "items": { "type": "string" } },
          "routes": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["description", "appFunctionality", "entities", "monetization", "userRoles", "routes"]
      }
    }
  }
}
```

- [ ] **Step 2: Add the `Mode` interface to `src/types.ts`**

Add at the top of the file (after the existing imports, before `InlineScriptData`):

```ts
export interface Mode {
  description: string;
  prompts: { map: string; reduce: string; user: string };
  schema: { map: Record<string, unknown>; reduce: Record<string, unknown> };
}
```

- [ ] **Step 3: Write the failing test `tests/modes.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveMode, listModes, validateMode } from "../src/config.js";

describe("modes", () => {
  it("lists the built-in modes", () => {
    const modes = listModes();
    expect(modes).toContain("security");
    expect(modes).toContain("product");
  });

  it("resolves a known mode with prompts and schema", () => {
    const mode = resolveMode("security");
    expect(mode.prompts.map).toBeTruthy();
    expect(mode.prompts.reduce).toBeTruthy();
    expect(mode.prompts.user).toBeTruthy();
    expect(mode.schema.map).toBeTruthy();
    expect(mode.schema.reduce).toBeTruthy();
  });

  it("throws a helpful error for an unknown mode", () => {
    expect(() => resolveMode("nope")).toThrow(/Unknown mode "nope"/);
    expect(() => resolveMode("nope")).toThrow(/security/);
  });

  it("validateMode rejects a mode missing required fields", () => {
    expect(() => validateMode("broken", { description: "x" } as never)).toThrow(/broken/);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/modes.test.ts`
Expected: FAIL — `resolveMode`/`listModes`/`validateMode` are not exported from config.

- [ ] **Step 5: Rewrite `src/config.ts` to add mode loading (keep old exports)**

Replace the whole file with:

```ts
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
```

- [ ] **Step 6: Run the modes test to verify it passes**

Run: `npx vitest run tests/modes.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 7: Make the build copy `modes.json` into `dist/`**

`tsc` does not copy JSON files, and `dist/` currently has no JSON at all (the packaged build reads its prompts via `__dirname`, i.e. from `dist/`). Update the `build` script in `package.json` so the runtime file is present:

```json
"build": "tsc && cp src/modes.json dist/modes.json",
```

Run: `npm run build && ls dist/modes.json`
Expected: `dist/modes.json` exists.

- [ ] **Step 8: Run the full suite + lint to confirm nothing regressed**

Run: `npm run lint && npm test`
Expected: PASS (old analyzer/cli still compile against the retained legacy exports).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add modes.json + mode resolution in config"
```

---

## Task 3: Schema-driven analyzer + wire through CLI and pipeline

The core refactor. `analyzeChunked` changes its signature to take a `Mode`, so its caller (`pipeline.ts`), the CLI that builds the run config (`cli.ts`), and the shared types (`types.ts`) all change together to keep the tree green.

**Files:**
- Modify: `src/types.ts` (generic `AnalysisResult`, `RunConfig`, `RunOutput.mode`)
- Rewrite: `src/analyzer.ts`
- Modify: `src/pipeline.ts` (pass mode, generic success log)
- Rewrite: `src/cli.ts`
- Modify: `tests/analyzer.test.ts`
- Modify: `tests/pipeline.test.ts`

- [ ] **Step 1: Update types in `src/types.ts`**

Replace the `AnalysisResult` interface (currently lines 31-41) with a generic record:

```ts
export type AnalysisResult = Record<string, unknown> & { rawResponse: string };
```

Replace the `RunOutput` interface (currently lines 60-70): change the `prompt: string;` field to `mode: string;` so it reads:

```ts
export interface RunOutput {
  runId: string;
  startedAt: string;
  completedAt: string;
  model: string;
  mode: string;
  totalDomains: number;
  successful: number;
  failed: number;
  results: DomainResult[];
}
```

Replace the `CliOptions` interface (currently lines 72-85) with `RunConfig`:

```ts
export interface RunConfig {
  input: string;
  output: string;
  mode: string;
  model: string;
  concurrency: number;
  maxBundleSize: number;
  maxBundles: number;
  timeout: number;
  sourceMaps: boolean;
  baseUrl?: string;
  json: boolean;
  verbose: boolean;
}
```

- [ ] **Step 2: Update the failing analyzer test `tests/analyzer.test.ts`**

Replace the whole file with (note the mock's `reduceResponse` no longer needs `versions`, and `analyzeChunked` now takes a `Mode`):

```ts
import { describe, it, expect, vi } from "vitest";
import type { CodeChunk } from "../src/chunker.js";
import type { Mode } from "../src/types.js";

vi.mock("openai", () => {
  const mapResponse = JSON.stringify({
    stack: ["React 18.2.0"],
    endpoints: ["POST /api/auth/login"],
    routes: ["/dashboard"],
    authMechanisms: ["JWT in localStorage"],
    securityFindings: [],
    appFunctionality: ["user login"],
    interestingStrings: [],
  });

  const reduceResponse = JSON.stringify({
    stack: ["React 18.2.0", "TypeScript"],
    description: "A task management app with authentication",
    endpoints: ["POST /api/auth/login"],
    routes: ["/dashboard"],
    authMechanisms: ["JWT in localStorage"],
    securityFindings: ["token stored in localStorage"],
    appFunctionality: ["user login", "task management"],
  });

  let callCount = 0;

  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockImplementation(() => {
            callCount++;
            const content = callCount <= 1 ? mapResponse : reduceResponse;
            return Promise.resolve({ choices: [{ message: { content } }] });
          }),
        },
      };
      constructor() {}
    },
  };
});

const securityMode: Mode = {
  description: "security",
  prompts: { map: "map prompt", reduce: "reduce prompt", user: "Analyze this app" },
  schema: {
    map: {
      type: "object",
      properties: {
        stack: { type: "array", items: { type: "string" } },
        endpoints: { type: "array", items: { type: "string" } },
        routes: { type: "array", items: { type: "string" } },
        authMechanisms: { type: "array", items: { type: "string" } },
        securityFindings: { type: "array", items: { type: "string" } },
        appFunctionality: { type: "array", items: { type: "string" } },
        interestingStrings: { type: "array", items: { type: "string" } },
      },
    },
    reduce: {
      type: "object",
      properties: {
        stack: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        endpoints: { type: "array", items: { type: "string" } },
      },
    },
  },
};

describe("analyzeChunked", () => {
  it("performs schema-driven map-reduce analysis over chunks", async () => {
    const { analyzeChunked } = await import("../src/analyzer.js");

    const chunks: CodeChunk[] = [
      {
        bundleUrl: "https://example.com/main.js",
        index: 0,
        totalChunks: 1,
        content: 'import React from "react";\nfetch("/api/auth/login");',
        charCount: 52,
      },
    ];

    const result = await analyzeChunked(chunks, "gpt-4.1", securityMode, "fake-key");

    expect(result.stack).toContain("React 18.2.0");
    expect(result.description).toContain("task management");
    expect(result.endpoints).toContain("POST /api/auth/login");
  });
});
```

- [ ] **Step 3: Run the analyzer test to verify it fails**

Run: `npx vitest run tests/analyzer.test.ts`
Expected: FAIL — current `analyzeChunked` signature takes a `prompt: string`, not a `Mode`; types won't match / `result.stack` undefined.

- [ ] **Step 4: Rewrite `src/analyzer.ts` to be schema-driven**

Replace the whole file with:

```ts
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
```

- [ ] **Step 5: Run the analyzer test to verify it passes**

Run: `npx vitest run tests/analyzer.test.ts`
Expected: PASS.

- [ ] **Step 6: Update `src/pipeline.ts` to resolve and pass the mode**

Add `resolveMode` to the config import (currently line 5):

```ts
import { getApiKey, resolveMode } from "./config.js";
```

In `runPipeline`, resolve the mode once near the top (after the input validation, before the `apiKey` line ~48). Add:

```ts
  const mode = resolveMode(opts.mode);
```

Update the `RunOutput` object (currently lines 62-72): change `prompt: opts.prompt,` to `mode: opts.mode,`.

Change the `processDomain` signature and the `analyzeChunked` call. Update the call (currently lines 193-201) from:

```ts
    const analysis = await analyzeChunked(
      chunks,
      opts.model,
      opts.prompt,
      apiKey,
      distilledBundles,
      opts.baseUrl,
      extraContext
    );
```

to pass the resolved `mode`. Thread `mode` into `processDomain` by adding a parameter, or resolve it inside `processDomain`. Simplest: resolve inside `processDomain` so the signature churn is minimal — add at the top of `processDomain` (after `log(...)`):

```ts
  const mode = resolveMode(opts.mode);
```

and change the call to:

```ts
    const analysis = await analyzeChunked(
      chunks,
      opts.model,
      mode,
      apiKey,
      distilledBundles,
      opts.baseUrl,
      extraContext
    );
```

(The top-level `const mode = resolveMode(opts.mode)` in `runPipeline` is still wanted so an invalid mode fails fast before any domain work — keep both. The per-domain resolve is cheap.)

- [ ] **Step 7: Make the success log mode-agnostic in `src/pipeline.ts`**

Replace the success log (currently lines 203-205):

```ts
    log(
      `  ✓ ${domain} — ${analysis.stack.join(", ") || "unknown stack"}`
    );
```

with a generic version that does not assume a `stack` field:

```ts
    const stackField = (analysis as Record<string, unknown>).stack;
    const summary = Array.isArray(stackField) ? stackField.join(", ") : "";
    log(`  ✓ ${domain}${summary ? ` — ${summary}` : ""}`);
```

- [ ] **Step 8: Update the `CliOptions` type reference in `src/pipeline.ts`**

The import (currently line 4) references `CliOptions`. Change it to `RunConfig`:

```ts
import type { RunConfig, DomainResult, RunOutput } from "./types.js";
```

and update the two function signatures that use `opts: CliOptions` to `opts: RunConfig` (in `runPipeline` and `processDomain`).

- [ ] **Step 9: Rewrite `src/cli.ts`**

Replace the whole file with:

```ts
import { Command } from "commander";
import { resolve } from "node:path";
import type { RunConfig } from "./types.js";
import {
  DEFAULT_MODEL,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_BUNDLE_SIZE_KB,
  DEFAULT_MAX_BUNDLES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_SOURCE_MAPS,
  listModes,
  resolveMode,
} from "./config.js";
import { setLogOptions } from "./utils/logger.js";
import { runPipeline } from "./pipeline.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("fafo")
    .description(
      "Frontend And Find Out — analyze a website's JS bundles through a chosen research mode"
    )
    .version("0.1.0")
    .requiredOption("-i, --input <path>", "Path to input JSON file (array of domains)")
    .requiredOption(
      "-m, --mode <name>",
      `Research mode: ${listModes().join(", ")}`
    )
    .option(
      "-o, --output <path>",
      "Path to output JSON file",
      `./output/results-${Date.now()}.json`
    )
    .option("--json", "Output only JSON to stdout (no progress)", false)
    .option("--verbose", "Show detailed progress on stderr", false)
    .action(async (rawOpts) => {
      // Validate the mode up front for a clean error message.
      try {
        resolveMode(rawOpts.mode);
      } catch (err) {
        process.stderr.write(
          (err instanceof Error ? err.message : String(err)) + "\n"
        );
        process.exit(2);
      }

      const opts: RunConfig = {
        input: resolve(rawOpts.input),
        output: resolve(rawOpts.output),
        mode: rawOpts.mode,
        model: DEFAULT_MODEL,
        concurrency: DEFAULT_CONCURRENCY,
        maxBundleSize: DEFAULT_MAX_BUNDLE_SIZE_KB,
        maxBundles: DEFAULT_MAX_BUNDLES,
        timeout: DEFAULT_TIMEOUT_MS,
        sourceMaps: DEFAULT_SOURCE_MAPS,
        baseUrl: process.env.OPENAI_BASE_URL,
        json: rawOpts.json,
        verbose: rawOpts.verbose,
      };

      setLogOptions({ verbose: opts.verbose, json: opts.json });

      try {
        const result = await runPipeline(opts);

        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        }

        const anySuccess = result.results.some((r) => r.status === "success");
        process.exit(anySuccess ? 0 : 1);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Fatal: ${message}\n`);
        process.exit(2);
      }
    });

  return program;
}
```

- [ ] **Step 10: Update `tests/pipeline.test.ts` for the mode-based config mock**

Replace the `vi.mock("../src/config.js", ...)` block (currently lines 56-65) with one that provides the new exports including `resolveMode`:

```ts
vi.mock("../src/config.js", () => {
  const fakeMode = {
    description: "test",
    prompts: { map: "m", reduce: "r", user: "u" },
    schema: {
      map: { type: "object", properties: {} },
      reduce: { type: "object", properties: {} },
    },
  };
  return {
    getApiKey: () => "fake-key",
    DEFAULT_MODEL: "gpt-4.1",
    DEFAULT_CONCURRENCY: 2,
    DEFAULT_MAX_BUNDLE_SIZE_KB: 100,
    DEFAULT_MAX_BUNDLES: 3,
    DEFAULT_TIMEOUT_MS: 5000,
    DEFAULT_SOURCE_MAPS: false,
    DEFAULT_VERBOSE: false,
    MAX_TOTAL_CHARS: 120_000,
    MAP_CONCURRENCY: 5,
    DISTILLED_ONLY_THRESHOLD: 60_000,
    listModes: () => ["security", "product"],
    resolveMode: () => fakeMode,
    validateMode: () => undefined,
  };
});
```

Then update the `runPipeline(...)` call object (currently lines 95-106): remove `prompt: "What stack?",` and add `mode: "security",` and `sourceMaps: false,`:

```ts
    const result = await runPipeline({
      input: tmpInput,
      output: tmpOutput,
      mode: "security",
      concurrency: 2,
      model: "gpt-4.1",
      maxBundleSize: 100,
      maxBundles: 3,
      timeout: 5000,
      sourceMaps: false,
      json: true,
      verbose: false,
    });
```

The assertions stay the same — the mocked openai response still returns `{ stack: ["React"], ... }`, and generic parse passes `stack` through, so `result.results[0].analysis?.stack` still contains `"React"`.

- [ ] **Step 11: Run the full suite + lint**

Run: `npm run lint && npm test`
Expected: PASS — analyzer, pipeline, modes, and all untouched tests green.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: schema-driven analyzer wired through mode-based CLI"
```

---

## Task 4: Smoke-test the CLI end to end

Verify the assembled CLI behaves: required flags enforced, unknown mode rejected, `--help` lists modes. No API calls needed for the error paths.

**Files:** none (manual verification + build).

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: PASS — compiles to `dist/`.

- [ ] **Step 2: `--help` lists the modes and required flags**

Run: `node dist/index.js --help`
Expected: Usage shows `fafo`, `-i, --input` and `-m, --mode` as required, and the mode description line contains `security, product`.

- [ ] **Step 3: Missing `--mode` is rejected**

Run: `node dist/index.js --input ./input.json`
Expected: Non-zero exit; commander error `required option '-m, --mode <name>' not specified`.

- [ ] **Step 4: Unknown mode is rejected with the mode list**

Run: `node dist/index.js --input ./input.json --mode bogus`
Expected: Non-zero exit; stderr contains `Unknown mode "bogus"` and `Available modes: security, product`.

- [ ] **Step 5: Commit (if any tweaks were needed)**

If steps 2-4 required fixes, commit them:

```bash
git add -A
git commit -m "fix: CLI mode validation and help output"
```

Otherwise skip — nothing to commit.

---

## Task 5: Delete legacy prompts and exports

Now that nothing reads `prompts.json` or the legacy `DEFAULT_PROMPT`/`PROMPT_PRESETS` exports, remove them.

**Files:**
- Delete: `src/prompts.json`
- Modify: `src/config.ts` (remove legacy block)

- [ ] **Step 1: Confirm nothing references the legacy exports or file**

Run: `grep -rn "DEFAULT_PROMPT\|PROMPT_PRESETS\|prompts.json" src tests`
Expected: matches ONLY inside `src/config.ts` (the legacy block). If anything else matches, stop and update that caller first.

- [ ] **Step 2: Remove the legacy block from `src/config.ts`**

Delete these lines at the bottom of `src/config.ts`:

```ts
// --- Legacy exports (still used by old analyzer/cli until Task 3) ---------
const legacyPrompts = JSON.parse(
  readFileSync(join(__dirname, "prompts.json"), "utf-8")
);
export const DEFAULT_PROMPT: string = legacyPrompts.default;
export const PROMPT_PRESETS: Record<string, string> = legacyPrompts.presets;
```

- [ ] **Step 3: Delete `src/prompts.json`**

```bash
git rm src/prompts.json
```

- [ ] **Step 4: Verify the build still produces `dist/modes.json`**

The `cp src/modes.json dist/modes.json` build step was added in Task 2. Confirm it still works after deleting `prompts.json`.

Run: `npm run build && ls dist/modes.json`
Expected: `dist/modes.json` is present, and no error about a missing `prompts.json`.

- [ ] **Step 5: Run lint + tests**

Run: `npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove legacy prompts.json and exports"
```

---

## Task 6: Rename to fafo + update README

**Files:**
- Modify: `package.json` (name, bin, description, keywords)
- Rewrite: `README.md`

- [ ] **Step 1: Update `package.json`**

Change `name`, `description`, and `bin`:

```json
  "name": "fafo",
  "description": "CLI that analyzes a website's JS bundles through a chosen research mode (security or product)",
  "bin": {
    "fafo": "./dist/index.js"
  },
```

(Leave `version`, deps as-is. Keep the `cp src/modes.json dist/modes.json` build step added in Task 2.)

- [ ] **Step 2: Rewrite `README.md`**

Replace the Usage and Example sections to reflect the two-flag interface. The Usage block:

````markdown
## Usage

```
fafo --input <domains.json> --mode <name>

  -i, --input <path>     Input JSON file: array of domains (required)
  -m, --mode <name>      Research mode: security | product (required)
  -o, --output <path>    Output JSON file (default: ./output/results-<ts>.json)
  --json                 Output only JSON to stdout
  --verbose              Show progress on stderr
  -h, --help             Show help
```

## Modes

- **security** — greybox recon: tech stack, API endpoints, routes, auth mechanisms, security findings.
- **product** — product reconstruction: features, user workflows, business entities, monetization, user roles.

Modes are defined in `src/modes.json` (prompts + output schema). Shared tuning
(model, concurrency, timeouts, source maps) lives in `src/config.ts`.
````

Update the example invocation near the top from `fafo --input domains.json` to:

```bash
fafo --input domains.json --mode security
```

Remove the `--preset`/`--prompt`/`--model`/`--concurrency`/`--source-maps` flag documentation and the `versions` field from the example output JSON.

- [ ] **Step 3: Final build + test**

Run: `npm run build && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: rename to fafo and update README for modes"
```

---

## Self-Review Notes

- **Spec coverage:** CLI two-flag surface (Task 3/4), `modes.json` shape (Task 2), `config.ts` defaults (Task 2), schema-driven analyzer + generic merge (Task 3), two modes with their schemas (Task 2), removals of `versions`/CSS (Tasks 1–3), kept source maps + `interestingStrings` (preserved in Tasks 1 & 2), generic success log (Task 3 Step 7), `modes.json` validation (Task 2), rename (Task 6), README (Task 6), tests (Tasks 2–4). All spec sections map to a task.
- **Type consistency:** `Mode`, `RunConfig`, `AnalysisResult` (generic), `RunOutput.mode`, `analyzeChunked(chunks, model, mode, apiKey, ...)`, `resolveMode`/`listModes`/`validateMode` are used identically across config, analyzer, pipeline, cli, and tests.
- **Build artifact gotcha:** Task 5 Step 4 explicitly checks that `modes.json` lands in `dist/` (tsc won't copy JSON on its own) — this is the most likely runtime break and is verified before the rename.
```
