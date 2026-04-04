let verbose = false;
let jsonMode = false;

export function setLogOptions(opts: {
  verbose?: boolean;
  json?: boolean;
}): void {
  if (opts.verbose !== undefined) verbose = opts.verbose;
  if (opts.json !== undefined) jsonMode = opts.json;
}

export function log(message: string): void {
  if (!jsonMode) {
    process.stderr.write(message + "\n");
  }
}

export function logVerbose(message: string): void {
  if (verbose && !jsonMode) {
    process.stderr.write(message + "\n");
  }
}

export function logError(message: string): void {
  process.stderr.write(`ERROR: ${message}\n`);
}
