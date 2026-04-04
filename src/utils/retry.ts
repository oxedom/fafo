import { logVerbose } from "./logger.js";

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

function isRetryable(err: unknown): boolean {
  // Network errors from fetch (TypeError: fetch failed)
  if (err instanceof TypeError) return true;

  // HTTP status-based errors — retry on 429 and 5xx
  if (err instanceof Error) {
    const match = err.message.match(/HTTP (\d{3})/);
    if (match) {
      const status = parseInt(match[1], 10);
      return status === 429 || status >= 500;
    }
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: RetryOptions
): Promise<T> {
  const maxAttempts = opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt < maxAttempts - 1 && isRetryable(err)) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
        logVerbose(`    Retry ${attempt + 1}/${maxAttempts - 1} after ${Math.round(delay)}ms: ${err instanceof Error ? err.message : String(err)}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}
