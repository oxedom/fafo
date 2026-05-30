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

export interface AnalysisResult {
  stack: string[];
  versions: Record<string, string>;
  description: string;
  endpoints: string[];
  routes: string[];
  authMechanisms: string[];
  securityFindings: string[];
  appFunctionality: string[];
  rawResponse: string;
}

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
  prompt: string;
  totalDomains: number;
  successful: number;
  failed: number;
  results: DomainResult[];
}

export interface CliOptions {
  input: string;
  output: string;
  concurrency: number;
  model: string;
  baseUrl?: string;
  maxBundleSize: number;
  maxBundles: number;
  timeout: number;
  prompt: string;
  sourceMaps: boolean;
  json: boolean;
  verbose: boolean;
}
