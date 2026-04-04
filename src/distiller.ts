import { logVerbose } from "./utils/logger.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LibraryMatch {
  name: string;
  version: string | null;
  confidence: "high" | "medium";
}

export interface DistilledBundle {
  url: string;
  originalSizeBytes: number;
  distilledSizeBytes: number;
  compressionRatio: number;
  libraries: LibraryMatch[];
  endpoints: string[];
  routes: string[];
  envVars: string[];
  authPatterns: string[];
  interestingStrings: string[];
  appCodeChunks: string[];
}

// ─── Library Signatures ──────────────────────────────────────────────────────

interface LibrarySignature {
  name: string;
  patterns: RegExp[];
  versionPattern?: RegExp;
}

const LIBRARY_SIGNATURES: LibrarySignature[] = [
  {
    name: "React",
    patterns: [/react\.createElement/, /jsx\(/, /__REACT_DEVTOOLS/, /ReactDOM/, /useReducer/, /useState/],
    versionPattern: /react[.-](?:dom[.-])?(\d+\.\d+\.\d+)/,
  },
  {
    name: "Next.js",
    patterns: [/__NEXT_DATA__/, /next\/router/, /next\/link/, /_next\/static/],
    versionPattern: /Next\.js\s+v?(\d+\.\d+\.\d+)/,
  },
  {
    name: "Vue",
    patterns: [/__vue__/, /createVNode/, /Vue\.component/, /v-if/, /v-for/],
    versionPattern: /vue[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "Angular",
    patterns: [/@angular\/core/, /NgModule/, /ngOnInit/, /\bng-\w+/],
    versionPattern: /@angular\/core[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "Svelte",
    patterns: [/svelte\/internal/, /\$\$invalidate/, /SvelteComponent/],
    versionPattern: /svelte[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "jQuery",
    patterns: [/jQuery/, /\$\.ajax/, /\.ready\s*\(/],
    versionPattern: /jquery[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "Tailwind CSS",
    patterns: [/tailwindcss/, /tw-[\w-]+/],
    versionPattern: /tailwindcss[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "Material UI",
    patterns: [/@mui\/material/, /MuiButton/, /makeStyles/],
  },
  {
    name: "Radix UI",
    patterns: [/@radix-ui/, /radix-ui/],
  },
  {
    name: "Axios",
    patterns: [/axios\.create/, /axios\.get/, /axios\.post/, /isAxiosError/],
    versionPattern: /axios[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "Redux",
    patterns: [/createStore/, /combineReducers/, /useDispatch/, /useSelector/],
  },
  {
    name: "Zustand",
    patterns: [/zustand/, /create\(\s*\(set\b/],
  },
  {
    name: "React Query",
    patterns: [/useQuery/, /useMutation/, /QueryClient/, /@tanstack\/react-query/],
    versionPattern: /react-query[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "TanStack Router",
    patterns: [/createFileRoute/, /createRootRoute/, /@tanstack\/react-router/, /createRouter\(/],
    versionPattern: /react-router[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "React Router",
    patterns: [/react-router/, /BrowserRouter/, /useNavigate/, /createBrowserRouter/],
    versionPattern: /react-router[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "Stripe",
    patterns: [/stripe\.com/, /loadStripe/, /Stripe\(/],
  },
  {
    name: "Firebase",
    patterns: [/firebase\.google\.com/, /initializeApp/, /firebaseConfig/],
  },
  {
    name: "Supabase",
    patterns: [/supabase\.co/, /createClient/, /supabaseUrl/],
  },
  {
    name: "Auth0",
    patterns: [/auth0\.com/, /Auth0Client/, /loginWithRedirect/],
  },
  {
    name: "Clerk",
    patterns: [/clerk\.dev/, /ClerkProvider/, /useClerk/],
  },
  {
    name: "Sentry",
    patterns: [/sentry\.io/, /Sentry\.init/, /captureException/],
    versionPattern: /sentry[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "GraphQL",
    patterns: [/graphql/, /useQuery.*gql/, /__typename/],
  },
  {
    name: "tRPC",
    patterns: [/trpc/, /createTRPCClient/, /trpcClient/],
  },
  {
    name: "Vite",
    patterns: [/import\.meta\.hot/, /import\.meta\.env/, /@vite/],
    versionPattern: /vite[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "Webpack",
    patterns: [/__webpack_require__/, /webpackChunk/, /webpack_modules/],
  },
  {
    name: "i18next",
    patterns: [/i18next/, /i18n\.t\(/, /useTranslation/, /react-i18next/],
    versionPattern: /i18next[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "date-fns",
    patterns: [/date-fns/, /formatDistance/, /parseISO/, /isValid.*Date/],
    versionPattern: /date-fns[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "Zod",
    patterns: [/z\.string/, /z\.object/, /z\.number/, /ZodError/, /\$ZodString/],
    versionPattern: /zod[.-](\d+\.\d+\.\d+)/,
  },
  {
    name: "react-hook-form",
    patterns: [/useForm\(/, /useFormContext/, /react-hook-form/, /hookform/],
  },
  {
    name: "better-auth",
    patterns: [/better-auth/, /betterAuth/, /better_auth/],
  },
  {
    name: "Ably",
    patterns: [/ably\.io/, /Ably\.Realtime/, /ably/],
  },
  {
    name: "Capacitor",
    patterns: [/@capacitor/, /Capacitor\.isNative/, /capacitor/],
  },
];

// ─── URL Filtering ───────────────────────────────────────────────────────────

const BORING_URL_PATTERNS = [
  /fonts\.googleapis\.com/,
  /fonts\.gstatic\.com/,
  /cdn\.jsdelivr\.net/,
  /cdnjs\.cloudflare\.com/,
  /unpkg\.com/,
  /google-analytics\.com/,
  /googletagmanager\.com/,
  /facebook\.net/,
  /cloudflareinsights\.com/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/,
  /\.svg$/,
  /\.png$/,
  /\.jpg$/,
  /\.gif$/,
  /\.ico$/,
  /\.css$/,
  /data:image\//,
  /data:font\//,
];

function isInterestingUrl(url: string): boolean {
  return !BORING_URL_PATTERNS.some((p) => p.test(url));
}

// ─── Vendor Code Patterns ────────────────────────────────────────────────────

const VENDOR_CODE_PATTERNS = [
  /\.prototype\.\w+=function/,
  /__webpack_require__/,
  /module\.exports\s*=/,
  /Object\.defineProperty\(exports/,
  /exports\.__esModule/,
  /COMPILED.*goog/,
  /\.$$typeof/,
  /reactElement/i,
  /reconcile/i,
];

// ─── App Code Signals ────────────────────────────────────────────────────────

const APP_CODE_SIGNALS = [
  /fetch\s*\(/,
  /\.get\s*\(/,
  /\.post\s*\(/,
  /\.put\s*\(/,
  /\.patch\s*\(/,
  /\.delete\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /localStorage/,
  /sessionStorage/,
  /document\.cookie/,
  /addEventListener/,
  /Authorization/,
  /Bearer/,
  /password/i,
  /secret/i,
  /apikey/i,
  /api_key/i,
  /\badmin\b/i,
  /\brole\b/i,
  /\bpermission\b/i,
  /redirect/i,
  /navigate/i,
  /upload/i,
  /download/i,
  /payment/i,
  /checkout/i,
  /validate/i,
  /sanitize/i,
];

// ─── Main Distiller ──────────────────────────────────────────────────────────

export function distillBundle(url: string, content: string): DistilledBundle {
  const originalSize = Buffer.byteLength(content, "utf8");

  const libraries = detectLibraries(content);
  const endpoints = extractEndpoints(content);
  const routes = extractRoutes(content);
  const envVars = extractEnvVars(content);
  const authPatterns = extractAuthPatterns(content);
  const interestingStrings = extractInterestingStrings(content);
  const appCodeChunks = extractAppCode(content);

  const distilledParts = [
    ...endpoints,
    ...routes,
    ...envVars,
    ...authPatterns,
    ...interestingStrings,
    ...appCodeChunks,
  ];
  const distilledSize = Buffer.byteLength(distilledParts.join("\n"), "utf8");

  logVerbose(
    `  Distilled ${url}: ${originalSize}B → ${distilledSize}B ` +
      `(${((1 - distilledSize / originalSize) * 100).toFixed(1)}% reduction, ` +
      `${libraries.length} libs, ${endpoints.length} endpoints, ${routes.length} routes)`
  );

  return {
    url,
    originalSizeBytes: originalSize,
    distilledSizeBytes: distilledSize,
    compressionRatio: distilledSize / originalSize,
    libraries,
    endpoints,
    routes,
    envVars,
    authPatterns,
    interestingStrings,
    appCodeChunks,
  };
}

// ─── Pass 1: Library Detection ───────────────────────────────────────────────

function detectLibraries(code: string): LibraryMatch[] {
  const matches: LibraryMatch[] = [];

  for (const sig of LIBRARY_SIGNATURES) {
    const hitCount = sig.patterns.filter((p) => p.test(code)).length;
    if (hitCount === 0) continue;

    let version: string | null = null;
    if (sig.versionPattern) {
      const vMatch = code.match(sig.versionPattern);
      if (vMatch) version = vMatch[1];
    }

    matches.push({
      name: sig.name,
      version,
      confidence: hitCount >= 2 ? "high" : "medium",
    });
  }

  return matches;
}

// ─── Pass 2: Endpoint Extraction ─────────────────────────────────────────────

function extractEndpoints(code: string): string[] {
  const endpoints = new Set<string>();

  // /api/* paths in string literals
  const apiPathRe = /["'`](\/api\/[^"'`\s]{1,120})["'`]/g;
  for (const m of code.matchAll(apiPathRe)) {
    endpoints.add(m[1]);
  }

  // Full URLs
  const urlRe = /["'`](https?:\/\/[^\s"'`]{5,200})["'`]/g;
  for (const m of code.matchAll(urlRe)) {
    if (isInterestingUrl(m[1])) {
      endpoints.add(m[1]);
    }
  }

  // fetch/axios calls with path arguments
  const fetchRe = /(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*["'`](\/[^"'`\s]{1,120})["'`]/g;
  for (const m of code.matchAll(fetchRe)) {
    endpoints.add(m[1]);
  }

  // Template literal paths: `/users/${id}`
  const templateRe = /["'`](\/[a-z][a-z0-9-/]*\$\{[^}]+\}[^"'`]*)["'`]/gi;
  for (const m of code.matchAll(templateRe)) {
    endpoints.add(m[1]);
  }

  return [...endpoints].sort();
}

// ─── Pass 3: Route Extraction ────────────────────────────────────────────────

const STATIC_ASSET_EXTENSIONS = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map|json)$/i;

function extractRoutes(code: string): string[] {
  const routes = new Set<string>();

  // path: "/something", href: "/something", to: "/something"
  const propRe = /(?:path|href|to)\s*[:=]\s*["'`](\/[^"'`\s]{1,100})["'`]/g;
  for (const m of code.matchAll(propRe)) {
    if (!STATIC_ASSET_EXTENSIONS.test(m[1])) {
      routes.add(m[1]);
    }
  }

  // navigate("/something"), push("/something"), replace("/something")
  const navRe = /(?:navigate|push|replace)\s*\(\s*["'`](\/[^"'`\s]{1,100})["'`]/g;
  for (const m of code.matchAll(navRe)) {
    if (!STATIC_ASSET_EXTENSIONS.test(m[1])) {
      routes.add(m[1]);
    }
  }

  // pathname: "/something"
  const pathnameRe = /pathname\s*[:=]\s*["'`](\/[^"'`\s]{1,100})["'`]/g;
  for (const m of code.matchAll(pathnameRe)) {
    if (!STATIC_ASSET_EXTENSIONS.test(m[1])) {
      routes.add(m[1]);
    }
  }

  // createFileRoute("/something") — TanStack Router
  const fileRouteRe = /createFileRoute\s*\(\s*["'`](\/[^"'`\s]{0,100})["'`]/g;
  for (const m of code.matchAll(fileRouteRe)) {
    routes.add(m[1] || "/");
  }

  // createRoute({ path: "/something" })
  const createRouteRe = /createRoute\s*\(\s*\{[^}]*path\s*:\s*["'`](\/[^"'`\s]{0,100})["'`]/g;
  for (const m of code.matchAll(createRouteRe)) {
    routes.add(m[1] || "/");
  }

  return [...routes].sort();
}

// ─── Pass 4: Environment Variables ───────────────────────────────────────────

function extractEnvVars(code: string): string[] {
  const vars = new Set<string>();

  // process.env.SOMETHING
  const processEnvRe = /process\.env\.([A-Z_][A-Z0-9_]{2,})/g;
  for (const m of code.matchAll(processEnvRe)) {
    vars.add(`process.env.${m[1]}`);
  }

  // import.meta.env.SOMETHING
  const metaEnvRe = /import\.meta\.env\.([A-Z_][A-Z0-9_]{2,})/g;
  for (const m of code.matchAll(metaEnvRe)) {
    vars.add(`import.meta.env.${m[1]}`);
  }

  // Framework-prefixed vars in strings
  const prefixRe = /["'`]((?:REACT_APP|NEXT_PUBLIC|VITE|NUXT_PUBLIC)_[A-Z0-9_]+)["'`]/g;
  for (const m of code.matchAll(prefixRe)) {
    vars.add(m[1]);
  }

  return [...vars].sort();
}

// ─── Pass 5: Auth Patterns ───────────────────────────────────────────────────

function extractAuthPatterns(code: string): string[] {
  const patterns: string[] = [];

  // JWT tokens (eyJ... signatures)
  if (/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/.test(code)) {
    patterns.push("Hardcoded JWT token found in bundle");
  }

  if (/Bearer\s/.test(code)) {
    patterns.push("Bearer token usage");
  }

  if (/['"](Authorization|authorization)['"]\s*[:=]/.test(code)) {
    patterns.push("Authorization header construction");
  }

  if (/authorize\?|token_endpoint|client_id|client_secret/.test(code)) {
    patterns.push("OAuth flow references");
  }

  if (/document\.cookie\s*=/.test(code)) {
    patterns.push("Cookie manipulation (document.cookie =)");
  }

  if (/localStorage\.(set|get)Item.*(?:token|auth|session|jwt)/i.test(code)) {
    patterns.push("Token storage in localStorage");
  }

  if (/sessionStorage\.(set|get)Item.*(?:token|auth|session|jwt)/i.test(code)) {
    patterns.push("Token storage in sessionStorage");
  }

  if (/csrf|xsrf|_csrf|x-csrf/i.test(code)) {
    patterns.push("CSRF/XSRF protection references");
  }

  // Hardcoded API keys (common patterns)
  if (/["'][A-Za-z0-9_-]{20,}["']\s*(?:\/\/|\/\*)\s*(?:api|secret|key)/i.test(code)) {
    patterns.push("Possible hardcoded API key");
  }

  // better-auth specific
  if (/better-auth|betterAuth/.test(code)) {
    patterns.push("better-auth authentication library");
  }

  return patterns;
}

// ─── Pass 6: Interesting Strings ─────────────────────────────────────────────

function extractInterestingStrings(code: string): string[] {
  const strings = new Set<string>();

  // Error messages from throw/Error()/reject()
  const errorRe = /(?:throw\s+new\s+\w*Error\s*\(|Error\s*\(|reject\s*\()\s*["'`]([^"'`]{5,120})["'`]/g;
  for (const m of code.matchAll(errorRe)) {
    strings.add(`[error] ${m[1]}`);
  }

  // Console output
  const consoleRe = /console\.(?:log|warn|error|info)\s*\(\s*["'`]([^"'`]{5,120})["'`]/g;
  for (const m of code.matchAll(consoleRe)) {
    strings.add(`[console] ${m[1]}`);
  }

  // Feature flags and config keys
  const flagRe = /["'`]((?:feature_|flag_|config_|enable_|disable_|FEATURE_|FLAG_)[a-zA-Z0-9_-]+)["'`]/g;
  for (const m of code.matchAll(flagRe)) {
    strings.add(`[flag] ${m[1]}`);
  }

  // GraphQL operation names
  const gqlRe = /(?:query|mutation|subscription)\s+(\w{2,50})\s*[({]/g;
  for (const m of code.matchAll(gqlRe)) {
    strings.add(`[graphql] ${m[1]}`);
  }

  // Email addresses (potential test data)
  const emailRe = /["'`]([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})["'`]/g;
  for (const m of code.matchAll(emailRe)) {
    strings.add(`[email] ${m[1]}`);
  }

  // Phone numbers (international format)
  const phoneRe = /["'`](\+\d{7,15})["'`]/g;
  for (const m of code.matchAll(phoneRe)) {
    strings.add(`[phone] ${m[1]}`);
  }

  return [...strings].slice(0, 100);
}

// ─── Pass 7: App Code Extraction ─────────────────────────────────────────────

function extractAppCode(code: string, maxChars = 40_000): string[] {
  const modules = splitIntoModules(code);
  const scored = modules.map((m) => ({ code: m, score: scoreChunk(m) }));
  scored.sort((a, b) => b.score - a.score);

  const chunks: string[] = [];
  let totalChars = 0;

  for (const { code: chunk, score } of scored) {
    if (score <= 0) break;
    const cleaned = cleanChunk(chunk);
    if (cleaned.length < 50) continue;
    if (totalChars + cleaned.length > maxChars) break;
    chunks.push(cleaned);
    totalChars += cleaned.length;
  }

  return chunks;
}

function splitIntoModules(code: string): string[] {
  // Try webpack boundaries
  const webpackParts = code.split(/\/\*{4,}\//);
  if (webpackParts.length > 3) {
    return webpackParts.filter((p) => p.trim().length > 50);
  }

  // Try rollup/vite boundaries (var/let/const X = function/class)
  const rollupRe = /(?:^|\n)(?:var|let|const)\s+\w+\s*=\s*(?:function|class)\b/;
  const rollupParts = code.split(rollupRe);
  if (rollupParts.length > 3) {
    return rollupParts.filter((p) => p.trim().length > 50);
  }

  // Fallback: 50-line blocks
  const lines = code.split("\n");
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 50) {
    const block = lines.slice(i, i + 50).join("\n");
    if (block.trim().length > 50) {
      blocks.push(block);
    }
  }
  return blocks;
}

function scoreChunk(chunk: string): number {
  let score = 0;

  // Positive signals
  for (const signal of APP_CODE_SIGNALS) {
    if (signal.test(chunk)) score += 3;
  }

  // Bonus for path-like strings
  const pathMatches = chunk.match(/["'`]\/[a-z][a-z0-9-/]*["'`]/gi);
  if (pathMatches) {
    score += Math.min(pathMatches.length, 5);
  }

  // Negative: vendor patterns
  for (const vendor of VENDOR_CODE_PATTERNS) {
    if (vendor.test(chunk)) score -= 2;
  }

  // Negative: very short
  if (chunk.length < 100) score -= 5;

  // Negative: extremely minified (low whitespace ratio)
  if (chunk.length > 500) {
    const whitespace = (chunk.match(/\s/g) || []).length;
    if (whitespace / chunk.length < 0.02) score -= 3;
  }

  // Negative: high single-char variable density
  if (chunk.length > 200) {
    const singleCharVars = (chunk.match(/\b[a-z]\b/g) || []).length;
    if (singleCharVars / chunk.length > 0.05) score -= 2;
  }

  return score;
}

function cleanChunk(chunk: string): string {
  return chunk
    .split("\n")
    .filter((line) => line.length <= 500) // Remove long lines (base64, SVGs)
    .filter((line) => line.trim().length > 0) // Remove blank lines
    .join("\n");
}

// ─── Format for LLM ─────────────────────────────────────────────────────────

export function formatDistilledForLLM(distilled: DistilledBundle): string {
  const sections: string[] = [];

  sections.push(
    `=== Bundle: ${distilled.url} ===`,
    `Original size: ${distilled.originalSizeBytes}B → Distilled: ${distilled.distilledSizeBytes}B ` +
      `(${((1 - distilled.compressionRatio) * 100).toFixed(0)}% reduction)`
  );

  if (distilled.libraries.length > 0) {
    sections.push("");
    sections.push("--- Libraries Detected ---");
    for (const lib of distilled.libraries) {
      const ver = lib.version ? ` v${lib.version}` : "";
      sections.push(`  ${lib.name}${ver} (${lib.confidence} confidence)`);
    }
  }

  if (distilled.endpoints.length > 0) {
    sections.push("");
    sections.push("--- API Endpoints ---");
    for (const ep of distilled.endpoints) {
      sections.push(`  ${ep}`);
    }
  }

  if (distilled.routes.length > 0) {
    sections.push("");
    sections.push("--- Client Routes ---");
    for (const route of distilled.routes) {
      sections.push(`  ${route}`);
    }
  }

  if (distilled.envVars.length > 0) {
    sections.push("");
    sections.push("--- Environment Variables ---");
    for (const v of distilled.envVars) {
      sections.push(`  ${v}`);
    }
  }

  if (distilled.authPatterns.length > 0) {
    sections.push("");
    sections.push("--- Auth Patterns ---");
    for (const p of distilled.authPatterns) {
      sections.push(`  ${p}`);
    }
  }

  if (distilled.interestingStrings.length > 0) {
    sections.push("");
    sections.push("--- Notable Strings (errors, config, flags, test data) ---");
    for (const s of distilled.interestingStrings) {
      sections.push(`  ${s}`);
    }
  }

  if (distilled.appCodeChunks.length > 0) {
    sections.push("");
    sections.push("--- Application Code (vendor code stripped) ---");
    for (const chunk of distilled.appCodeChunks) {
      sections.push(chunk);
      sections.push("---");
    }
  }

  return sections.join("\n");
}
