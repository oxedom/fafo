import { describe, it, expect } from "vitest";
import { resolveMode, listModes, validateMode } from "../src/config.js";

describe("modes", () => {
  it("lists the built-in modes", () => {
    const modes = listModes();
    expect(modes).toContain("security");
    expect(modes).toContain("product");
  });

  it("resolves a known mode with prompts and schema", () => {
    const mode = resolveMode("security");
    expect(mode.prompts.map).toBeTruthy();
    expect(mode.prompts.reduce).toBeTruthy();
    expect(mode.prompts.user).toBeTruthy();
    expect(mode.schema.map).toBeTruthy();
    expect(mode.schema.reduce).toBeTruthy();
  });

  it("throws a helpful error for an unknown mode", () => {
    expect(() => resolveMode("nope")).toThrow(/Unknown mode "nope"/);
    expect(() => resolveMode("nope")).toThrow(/security/);
  });

  it("validateMode rejects a mode missing required fields", () => {
    expect(() => validateMode("broken", { description: "x" } as never)).toThrow(/broken/);
  });
});
