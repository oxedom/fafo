export interface CookieFlags {
  httpOnly: boolean;
  secure: boolean;
  sameSite: string | null;
}

export interface HeaderAnalysis {
  server: string | null;
  poweredBy: string | null;
  csp: string | null;
  hsts: { enabled: boolean; maxAge: number | null };
  xFrameOptions: string | null;
  permissionsPolicy: string | null;
  corsAllowOrigin: string | null;
  cookieFlags: CookieFlags[];
}

export function analyzeHeaders(headers: Record<string, string>): HeaderAnalysis {
  return {
    server: headers["server"] || null,
    poweredBy: headers["x-powered-by"] || null,
    csp: headers["content-security-policy"] || null,
    hsts: parseHsts(headers["strict-transport-security"]),
    xFrameOptions: headers["x-frame-options"] || null,
    permissionsPolicy: headers["permissions-policy"] || null,
    corsAllowOrigin: headers["access-control-allow-origin"] || null,
    cookieFlags: parseCookies(headers["set-cookie"]),
  };
}

function parseHsts(value: string | undefined): { enabled: boolean; maxAge: number | null } {
  if (!value) return { enabled: false, maxAge: null };

  const maxAgeMatch = value.match(/max-age=(\d+)/i);
  return {
    enabled: true,
    maxAge: maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : null,
  };
}

function parseCookies(value: string | undefined): CookieFlags[] {
  if (!value) return [];

  // set-cookie headers are joined with ", " by the Headers API but individual
  // cookies can also contain commas in Expires. Split on patterns that look
  // like a new cookie name=value start after a comma.
  const cookies = value.split(/,\s*(?=\w+=)/);

  return cookies.map((cookie) => {
    const lower = cookie.toLowerCase();
    return {
      httpOnly: lower.includes("httponly"),
      secure: lower.includes("secure"),
      sameSite: extractSameSite(lower),
    };
  });
}

function extractSameSite(cookie: string): string | null {
  const match = cookie.match(/samesite=(strict|lax|none)/i);
  return match ? match[1] : null;
}

export function formatHeadersForLLM(analysis: HeaderAnalysis): string {
  const lines: string[] = ["--- HTTP Response Headers ---"];

  if (analysis.server) lines.push(`Server: ${analysis.server}`);
  if (analysis.poweredBy) lines.push(`X-Powered-By: ${analysis.poweredBy}`);
  if (analysis.csp) lines.push(`Content-Security-Policy: ${analysis.csp}`);
  if (analysis.hsts.enabled) lines.push(`HSTS: enabled (max-age=${analysis.hsts.maxAge})`);
  if (analysis.xFrameOptions) lines.push(`X-Frame-Options: ${analysis.xFrameOptions}`);
  if (analysis.permissionsPolicy) lines.push(`Permissions-Policy: ${analysis.permissionsPolicy}`);
  if (analysis.corsAllowOrigin) lines.push(`CORS Allow-Origin: ${analysis.corsAllowOrigin}`);
  if (analysis.cookieFlags.length > 0) {
    for (const c of analysis.cookieFlags) {
      const flags = [
        c.httpOnly ? "HttpOnly" : "no-HttpOnly",
        c.secure ? "Secure" : "no-Secure",
        c.sameSite ? `SameSite=${c.sameSite}` : "no-SameSite",
      ].join(", ");
      lines.push(`Cookie flags: ${flags}`);
    }
  }

  // Only return if there's actual content beyond the header
  return lines.length > 1 ? lines.join("\n") : "";
}
