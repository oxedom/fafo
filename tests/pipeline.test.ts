import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const sampleHtml = readFileSync(
  resolve(__dirname, "fixtures/sample.html"),
  "utf-8"
);
const sampleBundle = readFileSync(
  resolve(__dirname, "fixtures/sample-bundle.js"),
  "utf-8"
);

// Create a temp input file
const tmpDir = resolve(__dirname, "../.tmp-test");
mkdirSync(tmpDir, { recursive: true });
const tmpInput = resolve(tmpDir, "input.json");
const tmpOutput = resolve(tmpDir, "output.json");
writeFileSync(tmpInput, JSON.stringify(["example.com"]));

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock openai
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    stack: ["React"],
                    versions: { React: "18.2.0" },
                    description: "A test app",
                  }),
                },
              },
            ],
          }),
        },
      };
      constructor() {}
    },
  };
});

// Mock config
vi.mock("../src/config.js", () => ({
  getApiKey: () => "fake-key",
  DEFAULT_MODEL: "gpt-4.1",
  DEFAULT_PROMPT: "What stack?",
  DEFAULT_CONCURRENCY: 2,
  DEFAULT_MAX_BUNDLE_SIZE_KB: 100,
  DEFAULT_MAX_BUNDLES: 3,
  DEFAULT_TIMEOUT_MS: 5000,
  MAX_TOTAL_CHARS: 120_000,
}));

describe("pipeline", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === "string" && url.includes(".js")) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({
            "content-type": "application/javascript",
          }),
          text: async () => sampleBundle,
          url,
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => sampleHtml,
        url,
      };
    });
  });

  it("processes domains and produces results", async () => {
    const { runPipeline } = await import("../src/pipeline.js");

    const result = await runPipeline({
      input: tmpInput,
      output: tmpOutput,
      concurrency: 2,
      model: "gpt-4.1",
      maxBundleSize: 100,
      maxBundles: 3,
      timeout: 5000,
      prompt: "What stack?",
      json: true,
      verbose: false,
    });

    expect(result.totalDomains).toBe(1);
    expect(result.successful).toBe(1);
    expect(result.results[0].domain).toBe("example.com");
    expect(result.results[0].status).toBe("success");
    expect(result.results[0].analysis?.stack).toContain("React");
  });
});
