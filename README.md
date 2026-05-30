# fafo — Frontend And Find Out

CLI tool that analyzes any website's JS bundles with AI through a chosen research mode.

```bash
npx fafo --input domains.json --mode security
```

## Setup

```bash
npm install -g fafo
echo '["github.com", "vercel.com"]' > input.json
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
  -h, --help             Show help
```

## Modes

A *mode* is a self-contained research profile — its own prompts and output schema.

- **security** — greybox recon: tech stack, API endpoints, routes, auth mechanisms, security findings.
- **product** — product reconstruction: features, user workflows, business entities, monetization, user roles.

Modes are defined in `src/modes.json` (prompts + output schema). Shared tuning
(model, concurrency, timeouts, source maps) lives in `src/config.ts`.

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
