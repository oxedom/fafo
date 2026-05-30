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
  DEFAULT_VERBOSE,
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
    .option("--verbose", "Show detailed progress on stderr", DEFAULT_VERBOSE)
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
