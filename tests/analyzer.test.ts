import { describe, it, expect, vi } from "vitest";
import type { CodeChunk } from "../src/chunker.js";
import type { Mode } from "../src/types.js";

vi.mock("openai", () => {
  const mapResponse = JSON.stringify({
    stack: ["React 18.2.0"],
    endpoints: ["POST /api/auth/login"],
    routes: ["/dashboard"],
    authMechanisms: ["JWT in localStorage"],
    securityFindings: [],
    appFunctionality: ["user login"],
    interestingStrings: [],
  });

  const reduceResponse = JSON.stringify({
    stack: ["React 18.2.0", "TypeScript"],
    description: "A task management app with authentication",
    endpoints: ["POST /api/auth/login"],
    routes: ["/dashboard"],
    authMechanisms: ["JWT in localStorage"],
    securityFindings: ["token stored in localStorage"],
    appFunctionality: ["user login", "task management"],
  });

  let callCount = 0;

  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockImplementation(() => {
            callCount++;
            const content = callCount <= 1 ? mapResponse : reduceResponse;
            return Promise.resolve({ choices: [{ message: { content } }] });
          }),
        },
      };
      constructor() {}
    },
  };
});

const securityMode: Mode = {
  description: "security",
  prompts: { map: "map prompt", reduce: "reduce prompt", user: "Analyze this app" },
  schema: {
    map: {
      type: "object",
      properties: {
        stack: { type: "array", items: { type: "string" } },
        endpoints: { type: "array", items: { type: "string" } },
        routes: { type: "array", items: { type: "string" } },
        authMechanisms: { type: "array", items: { type: "string" } },
        securityFindings: { type: "array", items: { type: "string" } },
        appFunctionality: { type: "array", items: { type: "string" } },
        interestingStrings: { type: "array", items: { type: "string" } },
      },
    },
    reduce: {
      type: "object",
      properties: {
        stack: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        endpoints: { type: "array", items: { type: "string" } },
      },
    },
  },
};

describe("analyzeChunked", () => {
  it("performs schema-driven map-reduce analysis over chunks", async () => {
    const { analyzeChunked } = await import("../src/analyzer.js");

    const chunks: CodeChunk[] = [
      {
        bundleUrl: "https://example.com/main.js",
        index: 0,
        totalChunks: 1,
        content: 'import React from "react";\nfetch("/api/auth/login");',
        charCount: 52,
      },
    ];

    const result = await analyzeChunked(chunks, "gpt-4.1", securityMode, "fake-key");

    expect(result.stack).toContain("React 18.2.0");
    expect(result.description).toContain("task management");
    expect(result.endpoints).toContain("POST /api/auth/login");
  });
});
