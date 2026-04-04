import { normalizeUrl } from "./utils/url.js";
import { logVerbose } from "./utils/logger.js";
import { withRetry } from "./utils/retry.js";

export interface FetchResult {
  url: string;
  html: string;
  contentType: string;
  headers: Record<string, string>;
}

export async function fetchDomainHtml(
  domain: string,
  timeoutMs: number
): Promise<FetchResult> {
  const httpsUrl = normalizeUrl(domain);

  // Try HTTPS first (with retry)
  try {
    const result = await withRetry(() => fetchUrl(httpsUrl, timeoutMs));
    return result;
  } catch (err) {
    logVerbose(
      `HTTPS failed for ${domain}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Fallback to HTTP
  const httpUrl = httpsUrl.replace("https://", "http://");
  logVerbose(`Trying HTTP fallback for ${domain}`);
  return withRetry(() => fetchUrl(httpUrl, timeoutMs));
}

async function fetchUrl(url: string, timeoutMs: number): Promise<FetchResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; DomainAnalyzer/0.1; +https://github.com/domain-analyzer)",
      Accept: "text/html,application/xhtml+xml,*/*",
      "Accept-Encoding": "gzip, deflate, br",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
    throw new Error(
      `Not HTML: content-type is "${contentType}"`
    );
  }

  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const html = await response.text();
  return { url: response.url, html, contentType, headers };
}
