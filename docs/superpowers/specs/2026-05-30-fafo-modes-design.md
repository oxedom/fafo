# fafo — Mode-Driven Redesign

**Date:** 2026-05-30
**Status:** Approved design, pending spec review

## Summary

Rework `fafo` from a reverse-engineering tool with a fixed security lens and a pile
of flat `--preset`/`--prompt` options into a **mode-driven** CLI. A *mode* is a
self-contained research profile (its own prompts and output schema) selected with a
single required flag. The tool ships with two modes: `security` and `product`.

The CLI surface collapses to:

```
fafo --input <domains.json> --mode <name> [--output <path>] [--json] [--verbose]
```

`--input` and `--mode` are **required** with no silent default. `--help` lists the
available modes.

## Goals

- Make the analytical lens a first-class, swappable concept rather than a hardcoded
  security focus.
- Two modes at launch:
  - **`security`** — greybox recon. Folds in tech-stack and endpoint discovery.
  - **`product`** — product/brainstorming. Ignores security; reconstructs features,
    user workflows, business entities, monetization.
- Each mode owns its **prompts** (map / reduce / user) and its **output schema**.
- Keep shared, rarely-changed tuning in `config.ts` as editable defaults — not in
  every mode and not on the CLI.
- Shed dead weight (`versions` field, CSS analysis) while keeping useful opt-in
  features (source maps, `interestingStrings`).

## Non-Goals

- No per-run CLI overrides of mode/config settings. `config.ts` + `modes.json` are
  the single source of truth. To change the model or concurrency, edit `config.ts`.
- No structured (object) feature schema for product mode in v1 — `appFunctionality`
  stays an array of rich paragraph strings (as today's `features` preset produces).
- No new modes beyond `security` and `product`.

## Architecture

### CLI (`src/cli.ts`)

Rewrite the commander program:

- `name("fafo")`, updated description.
- `-i, --input <path>` — **required**.
- `-m, --mode <name>` — **required**. Validated against `modes.json` keys; unknown
  or missing mode prints an error listing available modes and exits non-zero.
- `-o, --output <path>` — optional, defaults to `./output/results-<timestamp>.json`.
- `--json` — optional, JSON-only stdout (kept).
- `--verbose` — optional, progress on stderr (kept).
- `--help` — commander auto-generates; ensure the mode list and the
  required-ness of `--input`/`--mode` are visible. Mark options required via
  commander's `.requiredOption(...)` so missing flags produce a clear error.

The action handler resolves the mode via `config.ts`, builds a `RunConfig` (defaults
from `config.ts` merged with the resolved mode), and calls `runPipeline`.

### Config (`src/config.ts`)

- Keep `getApiKey`.
- Export shared defaults (editable in one place):
  `DEFAULT_MODEL`, `DEFAULT_CONCURRENCY`, `DEFAULT_MAX_BUNDLE_SIZE_KB`,
  `DEFAULT_MAX_BUNDLES`, `DEFAULT_TIMEOUT_MS`, `DEFAULT_SOURCE_MAPS` (false),
  `DEFAULT_VERBOSE` (false), plus the existing internal knobs
  (`MAX_TOTAL_CHARS`, and move `DISTILLED_ONLY_THRESHOLD` / `MAP_CONCURRENCY`
  here from `analyzer.ts` so all tuning lives together).
- Load `modes.json` (sibling file, same `__dirname` pattern as today's `prompts.json`).
- Add:
  - `listModes(): string[]`
  - `resolveMode(name: string): Mode` — throws a clear error if missing.
  - `validateMode(name, raw)` — asserts required fields (`description`,
    `prompts.map`, `prompts.reduce`, `prompts.user`, `schema.map`, `schema.reduce`)
    are present; throws listing what's missing.
- Delete the `DEFAULT_PROMPT` / `PROMPT_PRESETS` exports.

### Modes (`src/modes.json`) — replaces `src/prompts.json`

Each mode contains **only** what is genuinely mode-specific:

```jsonc
{
  "security": {
    "description": "Greybox recon — tech stack, API surface, auth, security findings",
    "prompts": {
      "map":    "<per-chunk security analyst system prompt>",
      "reduce": "<security synthesis system prompt>",
      "user":   "<security reduce-phase user prompt>"
    },
    "schema": {
      "map":    { /* JSON schema for chunk analysis */ },
      "reduce": { /* JSON schema for final analysis */ }
    }
  },
  "product": {
    "description": "Product reconstruction — features, workflows, entities, monetization",
    "prompts": { "map": "…", "reduce": "…", "user": "…" },
    "schema":  { "map": { … }, "reduce": { … } }
  }
}
```

Prompt content is migrated from today's `prompts.json`:
- `security.prompts.map` / `.reduce` ← today's `system.map` / `system.reduce`.
- `security.prompts.user` ← today's `default` (greybox recon line), broadened to note
  that stack and endpoints are part of recon.
- `product.prompts.user` ← today's `presets.features` text.
- `product.prompts.map` / `.reduce` ← adapted from the security system prompts,
  re-pointed at product/feature reconstruction and instructed to ignore security.

**Schema content:**

- `security.schema.map`: object of string-arrays — `stack`, `endpoints`, `routes`,
  `authMechanisms`, `securityFindings`, `appFunctionality`, `interestingStrings`.
  (`versions` removed; `interestingStrings` kept.)
- `security.schema.reduce`: `stack`, `description`, `endpoints`, `routes`,
  `authMechanisms`, `securityFindings`, `appFunctionality`. (`versions` removed.)
- `product.schema.map`: `appFunctionality`, `entities`, `interestingStrings`
  (feature-leaning fields; all string arrays).
- `product.schema.reduce`: `description` (string), `appFunctionality` (string array),
  `entities` (string array), `monetization` (string array), `userRoles` (string array),
  `routes` (string array).

All map-schema fields are string arrays so the generic merge (below) works uniformly.

### Schema-driven analyzer (`src/analyzer.ts`)

This is the most-touched, highest-risk change. Today the schema and fields are
hardcoded in three places (`MAP_RESPONSE_FORMAT`, `REDUCE_RESPONSE_FORMAT`, and the
per-field parse/merge). Make the analyzer schema-agnostic:

- `analyzeChunked(...)` takes the resolved **mode** (prompts + schemas) instead of a
  bare `prompt` string. Signature becomes roughly:
  `analyzeChunked(chunks, model, mode, apiKey, distilledBundles?, baseUrl?, extraContext?)`.
- Map phase: use `mode.schema.map` as the `response_format` json_schema; system prompt
  = `mode.prompts.map`. Parse the response as a generic object.
- **Generic merge** (`mergeChunkResults`): iterate the property names declared in
  `mode.schema.map`. For each, flatten across chunks and dedupe (reusing the existing
  case-insensitive `dedupe`). Keep the existing 100-item cap behavior for
  `interestingStrings`. No field names are hardcoded.
- Reduce phase: use `mode.schema.reduce` as `response_format`; system prompt =
  `mode.prompts.reduce`; user message = `mode.prompts.user` + extraContext +
  distilled data + merged findings (same assembly as today).
- Return type: a generic `AnalysisResult = Record<string, unknown> & { rawResponse: string }`.
  `emptyResult(description)` returns `{ description, rawResponse: "" }`.
- Move `DISTILLED_ONLY_THRESHOLD` / `MAP_CONCURRENCY` imports from `config.ts`.

### Types (`src/types.ts`)

- `AnalysisResult` → generic record (see above). Drop the fixed field list and
  `versions`.
- `CliOptions` → `RunConfig`: `{ input, output, mode, model, concurrency,
  maxBundleSize, maxBundles, timeout, sourceMaps, baseUrl?, json, verbose }`.
  (No `prompt`/`preset`. `mode` is the mode name; resolved `Mode` object passed
  separately or attached.)
- Add `Mode` interface: `{ description, prompts: { map, reduce, user },
  schema: { map, reduce } }` (schemas typed as JSON-schema-shaped records).
- `DomainResult`: remove `cssAnalysis`.
- `RunOutput`: replace `prompt` with `mode` (the mode name); `model` still recorded.

### Pipeline (`src/pipeline.ts`)

- Remove CSS: delete the `analyzeCss`/`extractStylesheets`/`fetchAndAnalyzeCss` usage,
  the `cssAnalysis` field from all `DomainResult` returns, and the css import.
  (`extractStylesheets` may remain in `parser.ts` unused, or be removed — implementer's
  call; prefer removing if no other caller.)
- Keep source maps (opt-in) and headers/HTML-metadata context assembly.
- Pass the resolved mode to `analyzeChunked` instead of `opts.prompt`.
- **Generic success log:** replace `analysis.stack.join(", ")` (line ~204) with a
  mode-agnostic summary — e.g. show `analysis.stack` if present, else fall back to
  the first non-empty array field or just `✓ <domain>`. Must not assume `stack`.
- `RunOutput` now carries `mode` instead of `prompt`.

### Output (`src/output.ts`)

No change.

### Removed / renamed

- **Delete** `src/css-analyzer.ts` and `tests/css-analyzer.test.ts`.
- **Delete** `src/prompts.json` (replaced by `src/modes.json`).
- **Remove** `versions` everywhere (schema, types, merge, README example).
- **Rename** `package.json` `name` → `fafo`, `bin` → `{ "fafo": "./dist/index.js" }`,
  and the commander `name("fafo")`. Update the stale CSS-referencing User-Agent string
  if that code moves.

## Data Flow

```
input.json (domains)
   │
   ▼
cli.ts ── resolveMode(--mode) ──► RunConfig (config defaults + mode)
   │
   ▼
pipeline.runPipeline
   │  per domain:
   │    fetch HTML → headers + metadata
   │    extract scripts → fetch bundles
   │    (opt-in) source maps
   │    distill (regex ground truth)
   │    chunk
   │    analyzeChunked(mode)  ── map(mode.schema.map) → generic merge → reduce(mode.schema.reduce)
   │
   ▼
RunOutput { mode, model, results[...] } ──► output file (+ stdout if --json)
```

## Error Handling

- Missing `--input` or `--mode`: commander `requiredOption` error, exit non-zero.
- Unknown mode: explicit message listing `listModes()`, exit 2.
- Malformed `modes.json` (missing required mode fields): `validateMode` throws a clear
  message on startup naming the mode and missing field.
- Per-domain failures: unchanged (captured as `status: "error"` in `DomainResult`).
- Reduce/map parse failures: `emptyResult(...)` fallback, unchanged in spirit.

## Testing

- **`tests/analyzer.test.ts`** — update for the generic result and schema-driven merge.
  Add a test that merge dedupes exactly the fields declared in a given map schema and
  does not assume `stack`/`versions`.
- **`tests/pipeline.test.ts`** — update for removed `cssAnalysis`, `mode` in
  `RunOutput`, and the generic success-log path (including a product-mode-shaped result
  that has no `stack`).
- **New `tests/modes.test.ts`** — `resolveMode`/`validateMode`: known modes resolve;
  unknown throws listing modes; a mode missing a required field fails validation.
- **Delete `tests/css-analyzer.test.ts`.**
- Other tests (parser, chunker, bundler, headers, sourcemap, url, retry) unchanged.

## README

Rewrite usage to the two-flag form, document the two modes and their output shapes,
remove `--preset`/`--prompt`/`versions`/CSS references, note `modes.json` as the place
to edit prompts/schemas and `config.ts` for shared tuning.

## Open Questions

None — all design decisions resolved during brainstorming.
