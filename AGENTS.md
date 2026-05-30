# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

`fafo` ("Frontend And Find Out") is a CLI that analyzes a website's JS bundles
with an LLM through a chosen **research mode** (e.g. `security`, `product`).
Published to npm as **`@oxedom/fafo`**; the installed command is `fafo`.

## Run it

```bash
# dev (no build, runs TypeScript directly)
npm run dev -- --input domains.json --mode security

# built binary
npm run build && node dist/index.js --input domains.json --mode security

# published
npx @oxedom/fafo --input domains.json --mode security
```

`domains.json` is a JSON array of domains, e.g. `["github.com", "vercel.com"]`.

### Flags

| Flag | Meaning |
|------|---------|
| `-i, --input <path>` | Input JSON file: array of domains (**required**) |
| `-m, --mode <name>` | Research mode: `security` \| `product` (**required**) |
| `-o, --output <path>` | Output JSON file (default `./output/results-<ts>.json`) |
| `--json` | Print only JSON to stdout (no progress) |
| `--verbose` | Detailed progress on stderr |

### Required environment

Set `OPENAI_API_KEY` (or `LLM_API_KEY`). A local `.env` is loaded automatically.
`.env` is gitignored and excluded from the npm tarball — **never commit it**.
Optional: `OPENAI_BASE_URL` to point at a compatible endpoint.

## How it works (pipeline)

1. **Fetch** HTML, extract JS bundle URLs (`fetcher.ts`, `parser.ts`, `bundler.ts`).
2. **Distill** with regex to pre-extract libraries/endpoints/routes (`distiller.ts`).
3. If distilled data is small (< `DISTILLED_ONLY_THRESHOLD`), send it directly to the LLM.
4. Otherwise **MAP** (parallel per-chunk analysis) → **REDUCE** (synthesis) (`chunker.ts`, `analyzer.ts`, `pipeline.ts`).

The selected **mode** supplies the prompts *and* the output JSON schema for every phase.

## Code map

- `src/index.ts` — bin entry (shebang); wires up the CLI.
- `src/cli.ts` — commander program, flags, exit codes.
- `src/config.ts` — shared defaults (model, concurrency, timeouts), API-key + mode loading.
- `src/modes.json` — **mode definitions** (prompts + schema per phase). Adding a mode is pure config, no code changes.
- `src/pipeline.ts` — orchestrates fetch → distill → map → reduce per domain.
- `src/{fetcher,parser,bundler,distiller,chunker,analyzer,sourcemap,headers,output}.ts` — pipeline stages.
- `src/utils/` — `logger`, `retry`, `url`.
- `tests/` — vitest specs mirroring `src/`.

## Conventions

- **ESM + `Node16` module resolution**: relative imports MUST use the `.js`
  extension even from `.ts` files (e.g. `import { x } from "./config.js"`).
- TypeScript is strict. Run `npm run lint` (`tsc --noEmit`) before finishing.
- The build copies `modes.json` into `dist/` — see the `build` script; `config.ts`
  reads it relative to its own location via `import.meta.url`.

## Verify before claiming done

```bash
npm run lint   # tsc --noEmit
npm test       # vitest, 60 tests
npm run build  # tsc + copy modes.json
```

## Adding a research mode

Add an entry to `src/modes.json` with `description`, `prompts.{map,reduce,user}`,
and `schema.{map,reduce}`. `config.ts` validates these fields at startup; no code
changes are needed because the analyzer derives output fields from the mode schema.

## Publishing

Published as the scoped public package `@oxedom/fafo`.

```bash
# bump version in BOTH package.json and the hardcoded version in src/cli.ts
npm publish        # prepublishOnly runs the build automatically
```

`files: ["dist"]` controls the tarball — only built output ships (not `src/`,
`tests/`, or `.env`).
