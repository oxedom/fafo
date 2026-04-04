export function resolveUrl(src: string, baseUrl: string): string {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

export function normalizeUrl(domain: string): string {
  const trimmed = domain.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /^localhost$/i,
];

export function validateDomain(input: string): string {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Domain cannot be empty");
  }

  // Reject dangerous schemes
  if (/^(file|data|blob|ftp):/i.test(trimmed)) {
    throw new Error(`Invalid scheme in domain: ${trimmed}`);
  }

  // Strip protocol if present
  const stripped = trimmed.replace(/^https?:\/\//, "");

  // Validate by parsing as URL
  let hostname: string;
  try {
    const parsed = new URL(`https://${stripped}`);
    hostname = parsed.hostname;
  } catch {
    throw new Error(`Invalid domain: ${trimmed}`);
  }

  // Reject private/reserved IPs
  if (PRIVATE_IP_PATTERNS.some((p) => p.test(hostname))) {
    throw new Error(`Private or reserved address rejected: ${hostname}`);
  }

  // Reject non-FQDN (must contain at least one dot)
  if (!hostname.includes(".")) {
    throw new Error(`Not a fully qualified domain name: ${hostname}`);
  }

  return stripped;
}
