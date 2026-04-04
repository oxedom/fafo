import { describe, it, expect, vi } from "vitest";
import type { CodeChunk } from "../src/chunker.js";

// Mock the openai module
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
    versions: { React: "18.2.0" },
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
            // First call(s) are map phase, last call is reduce phase
            const content = callCount <= 1 ? mapResponse : reduceResponse;
            return Promise.resolve({
              choices: [{ message: { content } }],
            });
          }),
        },
      };
      constructor() {}
    },
  };
});

describe("analyzeChunked", () => {
  it("performs map-reduce analysis over chunks", async () => {
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

    const result = await analyzeChunked(
      chunks,
      "gpt-4.1",
      "Analyze this app",
      "fake-key"
    );

    expect(result.stack).toContain("React 18.2.0");
    expect(result.description).toContain("task management");
    expect(result.endpoints).toContain("POST /api/auth/login");
  });
});
