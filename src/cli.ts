import { Command } from "commander";
import { resolve } from "node:path";
import type { CliOptions } from "./types.js";
import {
  DEFAULT_MODEL,
  DEFAULT_PROMPT,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_BUNDLE_SIZE_KB,
  DEFAULT_MAX_BUNDLES,
  DEFAULT_TIMEOUT_MS,
  PROMPT_PRESETS,
} from "./config.js";
import { setLogOptions } from "./utils/logger.js";
import { runPipeline } from "./pipeline.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("domain-analyzer")
    .description(
      "Analyze domains by fetching their JS bundles and detecting frontend stacks with AI"
    )
    .version("0.1.0")
    .option(
      "-i, --input <path>",
      "Path to input JSON file",
      "./input.json"
    )
    .option(
      "-o, --output <path>",
      "Path to output JSON file",
      `./output/results-${Date.now()}.json`
    )
    .option(
      "-c, --concurrency <n>",
      "Max parallel domain fetches",
      String(DEFAULT_CONCURRENCY)
    )
    .option("-m, --model <model>", "OpenAI model to use", DEFAULT_MODEL)
    .option("--base-url <url>", "OpenAI-compatible API base URL (for Ollama, Anthropic proxy, etc.)")
    .option(
      "--max-bundle-size <kb>",
      "Max KB of JS to send per bundle",
      String(DEFAULT_MAX_BUNDLE_SIZE_KB)
    )
    .option(
      "--max-bundles <n>",
      "Max bundles to analyze per domain",
      String(DEFAULT_MAX_BUNDLES)
    )
    .option(
      "--timeout <ms>",
      "HTTP fetch timeout in ms",
      String(DEFAULT_TIMEOUT_MS)
    )
    .option("--prompt <text>", "Custom analysis prompt", DEFAULT_PROMPT)
    .option(
      "--preset <name>",
      `Use a prompt preset: ${Object.keys(PROMPT_PRESETS).join(", ")}`
    )
    .option("--source-maps", "Attempt to fetch and parse source maps (makes additional HTTP requests)", false)
    .option("--json", "Output only JSON to stdout (no progress)", false)
    .option("--verbose", "Show detailed progress on stderr", false)
    .action(async (rawOpts) => {
      let prompt = rawOpts.prompt;
      if (rawOpts.preset) {
        const presetPrompt = PROMPT_PRESETS[rawOpts.preset];
        if (!presetPrompt) {
          process.stderr.write(
            `Unknown preset "${rawOpts.preset}". Available: ${Object.keys(PROMPT_PRESETS).join(", ")}\n`
          );
          process.exit(2);
        }
        prompt = presetPrompt;
      }

      const opts: CliOptions = {
        input: resolve(rawOpts.input),
        output: resolve(rawOpts.output),
        concurrency: parseInt(rawOpts.concurrency, 10),
        model: rawOpts.model,
        baseUrl: rawOpts.baseUrl || process.env.OPENAI_BASE_URL,
        maxBundleSize: parseInt(rawOpts.maxBundleSize, 10),
        maxBundles: parseInt(rawOpts.maxBundles, 10),
        timeout: parseInt(rawOpts.timeout, 10),
        prompt,
        sourceMaps: rawOpts.sourceMaps,
        json: rawOpts.json,
        verbose: rawOpts.verbose,
      };

      setLogOptions({ verbose: opts.verbose, json: opts.json });

      try {
        const result = await runPipeline(opts);

        if (opts.json) {
          process.stdout.write(JSON.stringify(result, null, 2) + "\n");
        }

        const anySuccess = result.results.some(
          (r) => r.status === "success"
        );
        process.exit(anySuccess ? 0 : 1);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        process.stderr.write(`Fatal: ${message}\n`);
        process.exit(2);
      }
    });

  return program;
}
