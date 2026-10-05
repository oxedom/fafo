# fafo

![fafo pixel-art eye logo](assets/fafo.jpg)

**Frontend And Find Out.** `fafo` reads a site's JavaScript bundles and turns them into a structured research report. Use it only on sites you are authorized to analyze.

[![npm version](https://img.shields.io/npm/v/@oxedom/fafo.svg)](https://www.npmjs.com/package/@oxedom/fafo)
[![license](https://img.shields.io/npm/l/@oxedom/fafo.svg)](LICENSE)

## Quick start

```bash
printf '["https://app.example.com"]\n' > domains.json
OPENAI_API_KEY=... npx @oxedom/fafo --input domains.json --mode security
```

The default provider is OpenAI. Or use a local, already-authenticated agent CLI:

```bash
npx @oxedom/fafo --input domains.json --mode product --provider codex
```

## What it reports

| Mode | Best for | Report includes |
| --- | --- | --- |
| `security` | Greybox recon | Stack, routes, API endpoints, auth patterns, and security-relevant observations |
| `product` | Product reconstruction | Features, workflows, business entities, roles, and monetization signals |

Results are written to `output/results-<timestamp>.json` by default. Add `--json` to print the report to stdout.

## Common options

```text
--input <path>            JSON array of hostnames or URLs (required)
--mode security|product   Research mode (required)
--provider <name>         openai (default), codex, claude, or agy
--model <name>            Model override
--output <path>           Result file path
--verbose                 Detailed progress on stderr
```

OpenAI uses `OPENAI_API_KEY` (or `LLM_API_KEY`). Local CLI providers use their existing local login; fafo does not pass OpenAI keys to them.

Run `npx @oxedom/fafo --help` for every option.

## How it works

fafo fetches page HTML, finds JavaScript bundles, extracts useful signals, then asks the selected provider to analyze the material. Large bundles are analyzed in chunks and combined into one report.

## Development

```bash
npm install
npm run lint
npm test
npm run build
```

## License

MIT
