import { describe, expect, it, vi } from "vitest";
import type { CodeChunk } from "../src/chunker.js";
import type { Mode } from "../src/types.js";

const invokeCliProvider = vi.fn(async ({ phase }: { phase: string }) =>
  phase === "map" ? { findings: ["found endpoint"] } : { description: "CLI analysis" }
);

vi.mock("../src/cli-provider.js", () => ({ invokeCliProvider }));

const mode: Mode = {
  description: "test",
  prompts: { map: "map prompt", reduce: "reduce prompt", user: "reduce user" },
  schema: {
    map: {
      type: "object",
      properties: { findings: { type: "array", items: { type: "string" } } },
      required: ["findings"],
      additionalProperties: false,
    },
    reduce: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
      additionalProperties: false,
    },
  },
};

describe("analyzeChunked with a CLI provider", () => {
  it("uses the configured CLI for map and reduce without creating an OpenAI client", async () => {
    const { analyzeChunked } = await import("../src/analyzer.js");
    const chunks: CodeChunk[] = [{
      bundleUrl: "https://example.com/app.js",
      index: 0,
      totalChunks: 1,
      content: "fetch('/api')",
      charCount: 13,
    }];

    const result = await analyzeChunked(
      chunks,
      "local-model",
      mode,
      "",
      undefined,
      undefined,
      undefined,
      "codex",
      "/opt/bin/codex",
      5_000
    );

    expect(result).toMatchObject({ description: "CLI analysis" });
    expect(invokeCliProvider).toHaveBeenCalledTimes(2);
    expect(invokeCliProvider).toHaveBeenCalledWith(expect.objectContaining({
      provider: "codex",
      executable: "/opt/bin/codex",
      phase: "map",
    }));
  });
});
