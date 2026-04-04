export interface CssAnalysis {
  designSystems: string[];
  cssInJsRuntimes: string[];
  themeVariables: string[];
  breakpoints: string[];
  fontStacks: string[];
}

interface CssSignature {
  name: string;
  patterns: RegExp[];
}

const DESIGN_SYSTEMS: CssSignature[] = [
  { name: "Tailwind CSS", patterns: [/@tailwind/, /@apply\s/, /\.tw-/] },
  { name: "Bootstrap", patterns: [/\.btn-primary/, /\.container-fluid/, /\.navbar-/] },
  { name: "Material Design", patterns: [/\.mdc-/, /\.mat-/] },
  { name: "Ant Design", patterns: [/\.ant-/, /\.antd-/] },
  { name: "Chakra UI", patterns: [/\.chakra-/] },
  { name: "Bulma", patterns: [/\.is-primary\.is-/, /\.hero-body/] },
  { name: "Foundation", patterns: [/\.callout/, /\.top-bar/] },
];

const CSS_IN_JS: CssSignature[] = [
  { name: "styled-components", patterns: [/data-styled/, /\.sc-/] },
  { name: "Emotion", patterns: [/data-emotion/, /\.css-[a-z0-9]{6,}/] },
  { name: "vanilla-extract", patterns: [/\.vanilla-extract/] },
];

export function analyzeCss(content: string): CssAnalysis {
  const designSystems: string[] = [];
  for (const sig of DESIGN_SYSTEMS) {
    if (sig.patterns.some((p) => p.test(content))) {
      designSystems.push(sig.name);
    }
  }

  const cssInJsRuntimes: string[] = [];
  for (const sig of CSS_IN_JS) {
    if (sig.patterns.some((p) => p.test(content))) {
      cssInJsRuntimes.push(sig.name);
    }
  }

  // Extract CSS custom properties from :root or [data-theme]
  const themeVarMatches = content.match(/--[\w][\w-]*/g);
  const themeVariables = [...new Set(themeVarMatches || [])].slice(0, 50);

  // Extract @media breakpoints
  const mediaMatches = content.match(/@media\s*\([^)]*(?:min|max)-width:\s*[\d.]+(?:px|em|rem)[^)]*\)/g);
  const breakpoints = [...new Set(mediaMatches || [])].slice(0, 20);

  // Extract font-family declarations
  const fontMatches = content.match(/font-family:\s*([^;}{]+)/g);
  const fontStacks = [...new Set(
    (fontMatches || []).map((m) => m.replace(/font-family:\s*/, "").trim())
  )].slice(0, 10);

  return { designSystems, cssInJsRuntimes, themeVariables, breakpoints, fontStacks };
}

export function formatCssAnalysisForLLM(analysis: CssAnalysis): string {
  const lines: string[] = ["--- CSS Analysis ---"];

  if (analysis.designSystems.length > 0) {
    lines.push(`Design systems: ${analysis.designSystems.join(", ")}`);
  }
  if (analysis.cssInJsRuntimes.length > 0) {
    lines.push(`CSS-in-JS: ${analysis.cssInJsRuntimes.join(", ")}`);
  }
  if (analysis.themeVariables.length > 0) {
    lines.push(`Theme variables (${analysis.themeVariables.length}): ${analysis.themeVariables.slice(0, 15).join(", ")}`);
  }
  if (analysis.breakpoints.length > 0) {
    lines.push(`Breakpoints: ${analysis.breakpoints.join(", ")}`);
  }
  if (analysis.fontStacks.length > 0) {
    lines.push(`Font stacks: ${analysis.fontStacks.join("; ")}`);
  }

  return lines.length > 1 ? lines.join("\n") : "";
}
