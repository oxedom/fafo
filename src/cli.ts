import { Command } from "commander";
import { resolve } from "node:path";
import type { AnalysisProvider, RunConfig } from "./types.js";
import {
  DEFAULT_MODEL,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_BUNDLE_SIZE_KB,
  DEFAULT_MAX_BUNDLES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_SOURCE_MAPS,
  DEFAULT_VERBOSE,
  DEFAULT_PROVIDER,
  DEFAULT_AGENT_TIMEOUT_MS,
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
    .version("0.1.1")
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
    .option("--verbose", "Show detailed progress on stderr", DEFAULT_VERBOSE)
    .option("--model <name>", "Model name (defaults to gpt-4.1 for OpenAI; local CLI default otherwise)")
    .option("--provider <name>", "Analysis provider: openai, codex, claude, or agy", DEFAULT_PROVIDER)
    .option("--agent-command <path>", "Path to the provider executable (CLI providers only)")
    .option("--agent-timeout <ms>", "CLI provider timeout in milliseconds", String(DEFAULT_AGENT_TIMEOUT_MS))
    .addHelpText("after", `
Examples:
  fafo --input domains.json --mode product
  fafo --input domains.json --mode security --provider codex
  fafo --input domains.json --mode product --provider claude --agent-timeout 300000
  fafo --input domains.json --mode security --provider agy --agent-command /path/to/agy

Providers:
  openai  Uses OPENAI_API_KEY or LLM_API_KEY (default)
  codex   Uses an existing local Codex CLI login
  claude  Uses an existing local Claude CLI login
  agy     Uses an existing local Antigravity CLI login

Input file:
  A JSON array of hostnames or URLs, for example:
  ["https://app.example.com", "example.org"]
`)
    .action(async (rawOpts) => {
      // Validate the mode up front for a clean error message.
      try {
        resolveMode(rawOpts.mode);
        if (!isAnalysisProvider(rawOpts.provider)) {
          throw new Error(`Unknown provider "${rawOpts.provider}". Available providers: openai, codex, claude, agy`);
        }
        if (rawOpts.agentCommand && rawOpts.provider === "openai") {
          throw new Error("--agent-command requires --provider codex, claude, or agy");
        }
        if (!Number.isSafeInteger(Number(rawOpts.agentTimeout)) || Number(rawOpts.agentTimeout) <= 0) {
          throw new Error("--agent-timeout must be a positive integer in milliseconds");
        }
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
        model: rawOpts.model || (rawOpts.provider === "openai" ? DEFAULT_MODEL : ""),
        concurrency: DEFAULT_CONCURRENCY,
        maxBundleSize: DEFAULT_MAX_BUNDLE_SIZE_KB,
        maxBundles: DEFAULT_MAX_BUNDLES,
        timeout: DEFAULT_TIMEOUT_MS,
        sourceMaps: DEFAULT_SOURCE_MAPS,
        baseUrl: process.env.OPENAI_BASE_URL,
        provider: rawOpts.provider,
        agentCommand: rawOpts.agentCommand,
        agentTimeout: Number(rawOpts.agentTimeout),
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

function isAnalysisProvider(value: string): value is AnalysisProvider {
  return ["openai", "codex", "claude", "agy"].includes(value);
}
