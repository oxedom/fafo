# fafo — Frontend And Find Out

A CLI tool that detects any website's frontend tech stack by analyzing its JavaScript bundles with AI.

Give it a list of domains — it fetches their JS bundles, distills framework signals, and uses an LLM to produce a structured JSON report: frameworks, design systems, build tools, and confidence scores.

Think Wappalyzer, but powered by reasoning over actual bundle contents rather than regex signatures.

## Features

- Detects React, Vue, Next.js, Nuxt, SvelteKit, Angular, and more
- Analyzes CSS stylesheets for design systems (Tailwind, MUI, Chakra, etc.)
- Reads HTTP response headers as additional signals
- Optionally fetches and parses source maps
- Map-reduce chunking for large bundles — handles real-world sites
- Pluggable LLM backend — OpenAI, Ollama, Anthropic proxy, or any compatible API
- Concurrent processing with configurable concurrency
- Prompt presets + custom prompts
- JSON output

## Install

```bash
npm install -g fafo
```

Or run without installing:

```bash
npx fafo --input domains.json
```

## Usage

Create an `input.json` file with an array of domains:

```json
["github.com", "vercel.com", "linear.app"]
```

Run:

```bash
fafo --input input.json --output results.json
```

### Options

```
-i, --input <path>          Path to input JSON file (default: ./input.json)
-o, --output <path>         Path to output JSON file
-c, --concurrency <n>       Max parallel domain fetches (default: 5)
-m, --model <model>         OpenAI model to use (default: gpt-4o-mini)
--base-url <url>            OpenAI-compatible API base URL (Ollama, Anthropic proxy, etc.)
--max-bundle-size <kb>      Max KB of JS to send per bundle
--max-bundles <n>           Max bundles to analyze per domain
--timeout <ms>              HTTP fetch timeout in ms
--prompt <text>             Custom analysis prompt
--preset <name>             Use a prompt preset
--source-maps               Fetch and parse source maps
--json                      Output only JSON to stdout
--verbose                   Show detailed progress
```

### Using with Ollama

```bash
fafo --input domains.json --base-url http://localhost:11434/v1 --model llama3
```

### Using with a custom prompt

```bash
fafo --input domains.json --prompt "What e-commerce platform and payment providers does this site use?"
```

## Output

```json
{
  "runId": "abc-123",
  "startedAt": "2026-04-04T10:00:00Z",
  "completedAt": "2026-04-04T10:00:45Z",
  "model": "gpt-4o-mini",
  "totalDomains": 3,
  "successful": 3,
  "failed": 0,
  "results": [
    {
      "domain": "vercel.com",
      "status": "success",
      "analysis": {
        "stack": ["Next.js", "React", "TypeScript"],
        "designSystems": ["Tailwind CSS"],
        "buildTools": ["Turbopack"],
        "confidence": "high",
        "evidence": "Found __NEXT_DATA__ global, React 18 concurrent features..."
      }
    }
  ]
}
```

## Setup

```bash
cp .env.example .env
# Add your OPENAI_API_KEY to .env
npm install
npm run build
```

## Development

```bash
npm run dev        # Run with tsx (no build needed)
npm test           # Run tests
npm run lint       # Type check
```

## License

MIT
