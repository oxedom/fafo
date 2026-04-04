# fafo — Frontend And Find Out

CLI tool that detects any website's frontend stack by analyzing its JS bundles with AI.

```bash
npx fafo --input domains.json
```

## Setup

```bash
npm install -g fafo
echo '["github.com", "vercel.com"]' > input.json
OPENAI_API_KEY=sk-... fafo --input input.json
```

## Usage

```
fafo [options]

  -i, --input <path>        Input JSON file (array of domains)
  -o, --output <path>       Output JSON file
  -m, --model <model>       OpenAI model (default: gpt-4.1)
  -c, --concurrency <n>     Parallel fetches (default: 5)
  --preset <name>           Prompt preset: stack | endpoints | i18n
  --prompt <text>           Custom prompt
  --base-url <url>          OpenAI-compatible API base URL
  --source-maps             Fetch source maps
  --verbose                 Show progress
  --json                    JSON-only stdout
```

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

1. Fetches HTML, extracts JS bundles and stylesheets
2. Runs regex distillation to pre-extract libraries, endpoints, routes
3. If distilled data is small enough — sends directly to LLM (cheap)
4. Otherwise: MAP (parallel per-chunk analysis) → REDUCE (synthesis)

All prompts live in `src/prompts.json` — edit them without touching code.

## License

MIT
