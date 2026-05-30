export interface Mode {
  description: string;
  prompts: { map: string; reduce: string; user: string };
  schema: { map: Record<string, unknown>; reduce: Record<string, unknown> };
}

export interface InlineScriptData {
  type: "next-data" | "initial-state" | "config" | "generic";
  content: string;
  extractedUrls: string[];
  extractedKeys: string[];
}

export interface HtmlMetadata {
  generator: string | null;
  cspMeta: string | null;
  openGraph: Record<string, string>;
  inlineScripts: InlineScriptData[];
  preconnectDomains: string[];
  prefetchUrls: string[];
}

export interface ScriptInfo {
  src: string;
  isModule: boolean;
  isAsync: boolean;
  isDefer: boolean;
}

export interface BundleContent {
  url: string;
  truncated: boolean;
  originalSizeBytes: number;
  content: string;
}

export type AnalysisResult = Record<string, unknown> & { rawResponse: string };

export interface DomainResult {
  domain: string;
  status: "success" | "error";
  url: string;
  fetchedAt: string;
  htmlTitle: string | null;
  headerAnalysis: import("./headers.js").HeaderAnalysis | null;
  htmlMetadata: HtmlMetadata | null;
  scriptsFound: number;
  bundlesAnalyzed: number;
  bundles: BundleContent[];
  analysis: AnalysisResult | null;
  error: string | null;
  durationMs: number;
}

export interface RunOutput {
  runId: string;
  startedAt: string;
  completedAt: string;
  model: string;
  mode: string;
  totalDomains: number;
  successful: number;
  failed: number;
  results: DomainResult[];
}

export interface RunConfig {
  input: string;
  output: string;
  mode: string;
  model: string;
  concurrency: number;
  maxBundleSize: number;
  maxBundles: number;
  timeout: number;
  sourceMaps: boolean;
  baseUrl?: string;
  json: boolean;
  verbose: boolean;
}
