import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RunOutput } from "./types.js";

export async function writeResults(
  output: RunOutput,
  outputPath: string
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
}
