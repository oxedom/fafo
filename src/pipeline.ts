import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pLimit from "p-limit";
import type { CliOptions, DomainResult, RunOutput } from "./types.js";
import { getApiKey } from "./config.js";
import { fetchDomainHtml } from "./fetcher.js";
import { extractScripts, extractTitle, extractHtmlMetadata, formatHtmlMetadataForLLM } from "./parser.js";
import { extractSourceMapUrl, fetchAndParseSourceMap, formatSourceMapForLLM } from "./sourcemap.js";
import type { SourceMapData } from "./sourcemap.js";
import { fetchBundles } from "./bundler.js";
import { analyzeChunked } from "./analyzer.js";
import { chunkBundles } from "./chunker.js";
import { distillBundle } from "./distiller.js";
import { writeResults } from "./output.js";
import { log, logVerbose, logError } from "./utils/logger.js";
import { validateDomain } from "./utils/url.js";
import { analyzeHeaders, formatHeadersForLLM } from "./headers.js";
import type { HeaderAnalysis } from "./headers.js";

export async function runPipeline(opts: CliOptions): Promise<RunOutput> {
  const startedAt = new Date().toISOString();

  // Read and validate input
  const raw = await readFile(opts.input, "utf-8");
  const domains = JSON.parse(raw);
  if (!Array.isArray(domains) || !domains.every((d) => typeof d === "string")) {
    throw new Error(
      `${opts.input} must be a JSON array of domain strings`
    );
  }

  // Validate domains, skip invalid ones
  const validDomains: string[] = [];
  for (const d of domains) {
    try {
      validDomains.push(validateDomain(d));
    } catch (err) {
      logError(`Skipping invalid domain "${d}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (validDomains.length === 0) {
    log("No valid domains in input file.");
  }

  const apiKey = getApiKey(!opts.baseUrl);
  const limit = pLimit(opts.concurrency);

  log(`Analyzing ${validDomains.length} domain(s) with concurrency ${opts.concurrency}...`);

  const results: DomainResult[] = await Promise.all(
    validDomains.map((domain: string, i: number) =>
      limit(() => processDomain(domain, i + 1, validDomains.length, opts, apiKey))
    )
  );

  const successful = results.filter((r) => r.status === "success").length;
  const failed = results.filter((r) => r.status === "error").length;

  const output: RunOutput = {
    runId: randomUUID(),
    startedAt,
    completedAt: new Date().toISOString(),
    model: opts.model,
    prompt: opts.prompt,
    totalDomains: validDomains.length,
    successful,
    failed,
    results,
  };

  await writeResults(output, opts.output);
  log(`\nResults written to ${opts.output}`);
  log(`Done: ${successful} succeeded, ${failed} failed out of ${domains.length} total.`);

  return output;
}

async function processDomain(
  domain: string,
  index: number,
  total: number,
  opts: CliOptions,
  apiKey: string
): Promise<DomainResult> {
  const start = Date.now();
  log(`[${index}/${total}] ${domain}`);

  try {
    // 1. Fetch HTML
    logVerbose(`  Fetching ${domain}...`);
    const { url, html, headers } = await fetchDomainHtml(domain, opts.timeout);
    const htmlTitle = extractTitle(html);
    const headerAnalysis = analyzeHeaders(headers);
    const htmlMetadata = extractHtmlMetadata(html, url);

    // 2. Extract scripts
    const scripts = extractScripts(html, url);
    logVerbose(`  Found ${scripts.length} script(s)`);

    if (scripts.length === 0) {
      return {
        domain,
        status: "success",
        url,
        fetchedAt: new Date().toISOString(),
        htmlTitle,
        headerAnalysis,
        htmlMetadata,
        scriptsFound: 0,
        bundlesAnalyzed: 0,
        bundles: [],
        analysis: null,
        error: null,
        durationMs: Date.now() - start,
      };
    }

    // 3. Fetch bundles
    const bundles = await fetchBundles(
      scripts,
      opts.maxBundles,
      opts.maxBundleSize,
      opts.timeout
    );
    logVerbose(`  Fetched ${bundles.length} bundle(s)`);

    if (bundles.length === 0) {
      return {
        domain,
        status: "success",
        url,
        fetchedAt: new Date().toISOString(),
        htmlTitle,
        headerAnalysis,
        htmlMetadata,
        scriptsFound: scripts.length,
        bundlesAnalyzed: 0,
        bundles: [],
        analysis: null,
        error: null,
        durationMs: Date.now() - start,
      };
    }

    // 3b. Fetch source maps (opt-in)
    const sourceMaps: SourceMapData[] = [];
    if (opts.sourceMaps) {
      logVerbose(`  Checking for source maps...`);
      for (const bundle of bundles) {
        const mapUrl = extractSourceMapUrl(bundle.content, bundle.url);
        if (mapUrl) {
          logVerbose(`    Found source map URL: ${mapUrl}`);
          const mapData = await fetchAndParseSourceMap(mapUrl, opts.timeout);
          if (mapData) {
            sourceMaps.push(mapData);
            logVerbose(`    Parsed source map: ${mapData.originalFiles.length} files`);
          }
        }
      }
    }

    // 4. Distill bundles (pre-extract structured data before LLM)
    logVerbose(`  Distilling bundles...`);
    const distilledBundles = bundles.map((b) => distillBundle(b.url, b.content));

    // 5. Beautify and chunk bundles for LLM analysis
    logVerbose(`  Chunking bundles...`);
    const chunks = chunkBundles(bundles);

    // 6. Analyze with LLM (map-reduce over chunks) + distilled ground truth
    logVerbose(`  Analyzing ${chunks.length} chunks with ${opts.model}...`);
    const contextParts = [
      formatHeadersForLLM(headerAnalysis),
      formatHtmlMetadataForLLM(htmlMetadata),
      ...sourceMaps.map(formatSourceMapForLLM),
    ].filter(Boolean);
    const extraContext = contextParts.length > 0 ? contextParts.join("\n\n") : undefined;

    const analysis = await analyzeChunked(
      chunks,
      opts.model,
      opts.prompt,
      apiKey,
      distilledBundles,
      opts.baseUrl,
      extraContext
    );

    log(
      `  ✓ ${domain} — ${analysis.stack.join(", ") || "unknown stack"}`
    );

    return {
      domain,
      status: "success",
      url,
      fetchedAt: new Date().toISOString(),
      htmlTitle,
      headerAnalysis,
      htmlMetadata,
      scriptsFound: scripts.length,
      bundlesAnalyzed: bundles.length,
      bundles: bundles.map((b) => ({
        url: b.url,
        truncated: b.truncated,
        originalSizeBytes: b.originalSizeBytes,
        content: "[omitted from result]",
      })),
      analysis,
      error: null,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`  ✗ ${domain} — ${message}`);
    return {
      domain,
      status: "error",
      url: "",
      fetchedAt: new Date().toISOString(),
      htmlTitle: null,
      headerAnalysis: null,
      htmlMetadata: null,
      scriptsFound: 0,
      bundlesAnalyzed: 0,
      bundles: [],
      analysis: null,
      error: message,
      durationMs: Date.now() - start,
    };
  }
}
