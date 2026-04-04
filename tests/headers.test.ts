import { describe, it, expect } from "vitest";
import { analyzeHeaders, formatHeadersForLLM } from "../src/headers.js";

describe("analyzeHeaders", () => {
  it("extracts server and powered-by", () => {
    const result = analyzeHeaders({
      "server": "nginx/1.24.0",
      "x-powered-by": "Express",
    });
    expect(result.server).toBe("nginx/1.24.0");
    expect(result.poweredBy).toBe("Express");
  });

  it("parses HSTS header", () => {
    const result = analyzeHeaders({
      "strict-transport-security": "max-age=31536000; includeSubDomains",
    });
    expect(result.hsts.enabled).toBe(true);
    expect(result.hsts.maxAge).toBe(31536000);
  });

  it("handles missing HSTS", () => {
    const result = analyzeHeaders({});
    expect(result.hsts.enabled).toBe(false);
    expect(result.hsts.maxAge).toBeNull();
  });

  it("extracts CSP", () => {
    const result = analyzeHeaders({
      "content-security-policy": "default-src 'self'; script-src 'self' cdn.example.com",
    });
    expect(result.csp).toContain("default-src");
  });

  it("extracts security headers", () => {
    const result = analyzeHeaders({
      "x-frame-options": "DENY",
      "permissions-policy": "camera=(), microphone=()",
      "access-control-allow-origin": "*",
    });
    expect(result.xFrameOptions).toBe("DENY");
    expect(result.permissionsPolicy).toBe("camera=(), microphone=()");
    expect(result.corsAllowOrigin).toBe("*");
  });

  it("parses cookie flags", () => {
    const result = analyzeHeaders({
      "set-cookie": "session=abc123; HttpOnly; Secure; SameSite=Strict, tracker=xyz; SameSite=Lax",
    });
    expect(result.cookieFlags).toHaveLength(2);
    expect(result.cookieFlags[0].httpOnly).toBe(true);
    expect(result.cookieFlags[0].secure).toBe(true);
    expect(result.cookieFlags[0].sameSite?.toLowerCase()).toBe("strict");
    expect(result.cookieFlags[1].httpOnly).toBe(false);
    expect(result.cookieFlags[1].sameSite?.toLowerCase()).toBe("lax");
  });

  it("returns nulls for empty headers", () => {
    const result = analyzeHeaders({});
    expect(result.server).toBeNull();
    expect(result.poweredBy).toBeNull();
    expect(result.csp).toBeNull();
    expect(result.xFrameOptions).toBeNull();
    expect(result.cookieFlags).toHaveLength(0);
  });
});

describe("formatHeadersForLLM", () => {
  it("formats non-empty analysis", () => {
    const analysis = analyzeHeaders({
      "server": "nginx",
      "x-frame-options": "SAMEORIGIN",
    });
    const text = formatHeadersForLLM(analysis);
    expect(text).toContain("Server: nginx");
    expect(text).toContain("X-Frame-Options: SAMEORIGIN");
  });

  it("returns empty string when no headers found", () => {
    const analysis = analyzeHeaders({});
    const text = formatHeadersForLLM(analysis);
    expect(text).toBe("");
  });
});
