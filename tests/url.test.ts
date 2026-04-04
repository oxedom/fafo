import { describe, it, expect } from "vitest";
import { validateDomain } from "../src/utils/url.js";

describe("validateDomain", () => {
  it("accepts valid domains", () => {
    expect(validateDomain("example.com")).toBe("example.com");
    expect(validateDomain("sub.example.co.uk")).toBe("sub.example.co.uk");
    expect(validateDomain("my-app.vercel.app")).toBe("my-app.vercel.app");
  });

  it("strips protocol prefixes", () => {
    expect(validateDomain("https://example.com")).toBe("example.com");
    expect(validateDomain("http://example.com")).toBe("example.com");
    expect(validateDomain("https://example.com/path")).toBe("example.com/path");
  });

  it("trims whitespace", () => {
    expect(validateDomain("  example.com  ")).toBe("example.com");
  });

  it("rejects empty input", () => {
    expect(() => validateDomain("")).toThrow("empty");
    expect(() => validateDomain("   ")).toThrow("empty");
  });

  it("rejects dangerous schemes", () => {
    expect(() => validateDomain("file:///etc/passwd")).toThrow("Invalid scheme");
    expect(() => validateDomain("data:text/html,<h1>hi</h1>")).toThrow("Invalid scheme");
    expect(() => validateDomain("blob:http://example.com")).toThrow("Invalid scheme");
    expect(() => validateDomain("ftp://files.example.com")).toThrow("Invalid scheme");
  });

  it("rejects private IPs", () => {
    expect(() => validateDomain("127.0.0.1")).toThrow("Private");
    expect(() => validateDomain("10.0.0.1")).toThrow("Private");
    expect(() => validateDomain("192.168.1.1")).toThrow("Private");
    expect(() => validateDomain("172.16.0.1")).toThrow("Private");
    expect(() => validateDomain("0.0.0.0")).toThrow("Private");
  });

  it("rejects non-FQDN", () => {
    expect(() => validateDomain("localhost")).toThrow("Private");
    expect(() => validateDomain("myserver")).toThrow("fully qualified");
  });
});
