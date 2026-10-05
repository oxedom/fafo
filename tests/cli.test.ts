import { describe, expect, it } from "vitest";
import { createProgram } from "../src/cli.js";

describe("CLI help", () => {
  it("documents the input format, providers, and runnable examples", () => {
    let help = "";
    const program = createProgram().configureOutput({ writeOut: (text) => { help += text; } });
    program.outputHelp();

    expect(help).toContain("Examples:");
    expect(help).toContain("--provider codex");
    expect(help).toContain("--provider claude");
    expect(help).toContain("--provider agy");
    expect(help).toContain("A JSON array of hostnames or URLs");
  });
});
