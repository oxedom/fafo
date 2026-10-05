# fafo — Frontend And Find Out

[![npm version](https://img.shields.io/npm/v/@oxedom/fafo.svg)](https://www.npmjs.com/package/@oxedom/fafo)
[![npm downloads](https://img.shields.io/npm/dm/@oxedom/fafo.svg)](https://www.npmjs.com/package/@oxedom/fafo)
[![license](https://img.shields.io/npm/l/@oxedom/fafo.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/@oxedom/fafo.svg)](https://www.npmjs.com/package/@oxedom/fafo)

CLI tool that analyzes any website's JS bundles with AI through a chosen research mode.

**📦 npm:** [`@oxedom/fafo`](https://www.npmjs.com/package/@oxedom/fafo)

```bash
npx @oxedom/fafo --input domains.json --mode security
```

## Setup

```bash
npm install -g @oxedom/fafo   # installs the `fafo` command
echo '["app.example.com", "app-staging.example.com"]' > input.json
OPENAI_API_KEY=sk-... fafo --input input.json --mode security
```

## Usage

```
fafo --input <domains.json> --mode <name>

  -i, --input <path>     Input JSON file: array of domains (required)
  -m, --mode <name>      Research mode: security | product (required)
  -o, --output <path>    Output JSON file (default: ./output/results-<ts>.json)
  --json                 Output only JSON to stdout
  --verbose              Show progress on stderr
  --model <name>         Override the OpenAI or local CLI model
  --provider <name>      Analysis provider: openai | codex | claude | agy (default: openai)
  --agent-command <path> Override the local CLI executable for a CLI provider
  --agent-timeout <ms>   CLI provider timeout in milliseconds (default: 120000)
  -h, --help             Show help
```

## CLI providers

The default `openai` provider keeps the existing API behavior and uses `OPENAI_API_KEY` (or `LLM_API_KEY`). To use an already-authenticated local agent executable instead, select one of `codex`, `claude`, or `agy`:

```bash
fafo --input input.json --mode security --provider codex
fafo --input input.json --mode product --provider claude --agent-command /usr/local/bin/claude
fafo --input input.json --mode security --provider agy --agent-timeout 180000
```

CLI providers do **not** read or pass `OPENAI_API_KEY`/`LLM_API_KEY` to the child process. They use the executable's own local login. `--agent-command` is an executable path, not a shell command; fafo never invokes a shell. Omit `--model` to use each local CLI's configured default, or set it explicitly when that CLI supports model selection.

For each map and reduce request, fafo sends a `fafo-cli-provider-v1` JSON request over stdin and passes the selected mode's existing JSON Schema to the agent CLI. The request identifies bundle content as untrusted data; provider runs are noninteractive, disable persistent sessions where supported, use a read-only/sandboxed mode where supported, and must return exactly one object conforming to the map or reduce schema. Invalid JSON, schema mismatches, non-zero exits, and timeouts make that analysis phase fail without exposing child stderr in results.

## Modes

A *mode* is a self-contained research profile — its own prompts **and** output
schema. The same bundle analyzed under two modes yields two differently-shaped
results, because each mode reasons through its own lens end-to-end (per-chunk map,
synthesis reduce, and the final JSON shape).

Pick the mode for the question you're asking:

| Mode | Use it to answer | Output fields |
|------|------------------|---------------|
| **security** | "What's the attack surface and how is it built?" | `stack`, `description`, `endpoints`, `routes`, `authMechanisms`, `securityFindings`, `appFunctionality` |
| **product** | "What is this product and how does it work?" | `description`, `appFunctionality` (deep per-feature reconstructions), `entities`, `monetization`, `userRoles`, `routes` |

```bash
fafo --input domains.json --mode security   # greybox recon: stack, API surface, auth, findings
fafo --input domains.json --mode product    # features, workflows, business entities, monetization
```

Modes are defined in `src/modes.json` (prompts + output schema). Adding a mode is
pure config — no code changes — because the analyzer derives its output fields from
the mode's schema. Shared tuning (model, concurrency, timeouts, source maps) lives
in `src/config.ts`.

## Example output

```json
{
  "domain": "vercel.com",
  "analysis": {
    "stack": ["Next.js", "React", "Tailwind CSS"],
    "endpoints": ["POST /api/deploy", "GET /api/projects/:id"],
    "securityFindings": ["Bearer token stored in localStorage"],
    "description": "Vercel deployment platform..."
  }
}
```

## How it works

1. Fetches HTML, extracts JS bundles
2. Runs regex distillation to pre-extract libraries, endpoints, routes
3. If distilled data is small enough — sends directly to the LLM (cheap)
4. Otherwise: MAP (parallel per-chunk analysis) → REDUCE (synthesis)

The selected mode supplies the prompts and the output schema for every phase.

## License

MIT
