import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const inputFiles = [
  path.join(root, "src", "styles", "theme", "base.css"),
  path.join(root, "src", "styles", "theme", "variants.css"),
];
const outputJsonPath = path.join(
  root,
  "docs",
  "accessibility",
  "button-contrast-report.json"
);
const outputMarkdownPath = path.join(
  root,
  "docs",
  "accessibility",
  "button-contrast-report.md"
);

const buttonSpecs = [
  {
    id: "primary",
    label: "Primary button",
    role: "button",
    textThreshold: 4.5,
    boundaryThreshold: 3,
    textFgToken: "--color-button-primary-fg",
    stateBgTokens: {
      default: "--color-button-primary-bg",
      hover: "--color-button-primary-bg-hover",
      active: "--color-button-primary-bg-active",
    },
    stateBorderTokens: {
      default: "--color-button-primary-border",
      hover: "--color-button-primary-border",
      active: "--color-button-primary-border",
    },
  },
  {
    id: "secondary",
    label: "Secondary button",
    role: "button",
    textThreshold: 4.5,
    boundaryThreshold: 3,
    textFgToken: "--color-button-secondary-fg",
    stateBgTokens: {
      default: "--color-button-secondary-bg",
      hover: "--color-button-secondary-bg-hover",
      active: "--color-button-secondary-bg-active",
    },
    stateBorderTokens: {
      default: "--color-button-secondary-border",
      hover: "--color-button-secondary-border",
      active: "--color-button-secondary-border",
    },
  },
  {
    id: "outline",
    label: "Outline button",
    role: "button",
    textThreshold: 4.5,
    boundaryThreshold: 3,
    textFgToken: "--color-button-outline-fg",
    stateBgTokens: {
      default: "--color-button-outline-bg",
      hover: "--color-button-outline-bg-hover",
      active: "--color-button-outline-bg-active",
    },
    stateBorderTokens: {
      default: "--color-button-outline-border",
      hover: "--color-button-outline-border",
      active: "--color-button-outline-border",
    },
  },
  {
    id: "ghost",
    label: "Ghost button",
    role: "button",
    textThreshold: 4.5,
    boundaryThreshold: 3,
    textFgToken: "--color-button-ghost-fg",
    stateBgTokens: {
      default: "--color-button-ghost-bg",
      hover: "--color-button-ghost-bg-hover",
      active: "--color-button-ghost-bg-active",
    },
    stateBorderTokens: {
      default: "--color-button-ghost-border",
      hover: "--color-button-ghost-border",
      active: "--color-button-ghost-border",
    },
  },
  {
    id: "destructive",
    label: "Destructive button",
    role: "button",
    textThreshold: 4.5,
    boundaryThreshold: 3,
    textFgToken: "--color-button-destructive-fg",
    stateBgTokens: {
      default: "--color-button-destructive-bg",
      hover: "--color-button-destructive-bg-hover",
      active: "--color-button-destructive-bg-active",
    },
    stateBorderTokens: {
      default: "--color-button-destructive-border",
      hover: "--color-button-destructive-border",
      active: "--color-button-destructive-border",
    },
  },
  {
    id: "success",
    label: "Success button",
    role: "button",
    textThreshold: 4.5,
    boundaryThreshold: 3,
    textFgToken: "--color-button-success-fg",
    stateBgTokens: {
      default: "--color-button-success-bg",
      hover: "--color-button-success-bg-hover",
      active: "--color-button-success-bg-active",
    },
    stateBorderTokens: {
      default: "--color-button-success-border",
      hover: "--color-button-success-border",
      active: "--color-button-success-border",
    },
  },
  {
    id: "disabled",
    label: "Disabled button",
    role: "button",
    textThreshold: 4.5,
    boundaryThreshold: 3,
    textFgToken: "--color-button-disabled-fg",
    stateBgTokens: {
      default: "--color-button-disabled-bg",
    },
    stateBorderTokens: {
      default: "--color-button-disabled-border",
    },
  },
  {
    id: "selected",
    label: "Selected button",
    role: "button",
    textThreshold: 4.5,
    boundaryThreshold: 3,
    textFgToken: "--color-button-selected-fg",
    stateBgTokens: {
      default: "--color-button-selected-bg",
    },
    stateBorderTokens: {
      default: "--color-button-selected-border",
    },
  },
];

const linkSpec = {
  id: "link",
  label: "Link-styled button",
  role: "text",
  textThreshold: 4.5,
  surfaces: ["card"],
  fgTokens: {
    default: "--color-button-link-fg",
    hover: "--color-button-link-fg-hover",
  },
};

const focusSpec = {
  id: "focus-ring",
  label: "Button focus ring",
  role: "ui",
  threshold: 3,
  ringToken: "--color-button-focus-ring",
  offsetToken: "--color-button-focus-offset",
};

const surfaces = [
  { id: "background", token: "--background", layers: [] },
  { id: "card", token: "--card", layers: ["--background"] },
];

const namedColors = {
  black: "#000000",
  white: "#ffffff",
  transparent: "#00000000",
};

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractTopLevelRules(css) {
  const rules = [];
  let index = 0;

  while (index < css.length) {
    while (index < css.length && /\s/.test(css[index])) {
      index += 1;
    }
    if (index >= css.length) break;

    if (css[index] === "@") {
      const nextBrace = css.indexOf("{", index);
      const nextSemi = css.indexOf(";", index);
      if (nextSemi !== -1 && (nextBrace === -1 || nextSemi < nextBrace)) {
        index = nextSemi + 1;
        continue;
      }
      if (nextBrace === -1) break;
      let depth = 1;
      index = nextBrace + 1;
      while (index < css.length && depth > 0) {
        if (css[index] === "{") depth += 1;
        if (css[index] === "}") depth -= 1;
        index += 1;
      }
      continue;
    }

    const selectorStart = index;
    const braceIndex = css.indexOf("{", selectorStart);
    if (braceIndex === -1) break;
    const selector = css.slice(selectorStart, braceIndex).trim();
    let depth = 1;
    index = braceIndex + 1;
    while (index < css.length && depth > 0) {
      if (css[index] === "{") depth += 1;
      if (css[index] === "}") depth -= 1;
      index += 1;
    }
    const body = css.slice(braceIndex + 1, index - 1).trim();
    rules.push({ selector, body });
  }

  return rules;
}

function parseDeclarations(body) {
  const declarations = {};
  const declarationPattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match = declarationPattern.exec(body);
  while (match) {
    declarations[match[1]] = match[2].trim();
    match = declarationPattern.exec(body);
  }
  return declarations;
}

function collectThemes() {
  const themes = [];

  for (const filePath of inputFiles) {
    const css = stripComments(fs.readFileSync(filePath, "utf8"));
    const rules = extractTopLevelRules(css);
    for (const rule of rules) {
      const selectors = rule.selector
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean);
      for (const selector of selectors) {
        if (!/^(:root|\.dark|\.theme-[\w-]+)$/.test(selector)) continue;
        const declarations = parseDeclarations(rule.body);
        if (!("--background" in declarations) || !("--foreground" in declarations)) {
          continue;
        }
        themes.push({
          selector,
          label: selector === ":root" ? ":root (default)" : selector,
          sourceFile: path.relative(root, filePath).replace(/\\/g, "/"),
          declarations,
        });
      }
    }
  }

  return themes;
}

function normalizeNumber(value) {
  if (value.endsWith("%")) {
    return Number.parseFloat(value) / 100;
  }
  return Number.parseFloat(value);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function parseHexColor(value) {
  const hex = value.slice(1);
  if (![3, 4, 6, 8].includes(hex.length)) {
    throw new Error(`Unsupported hex color: ${value}`);
  }

  if (hex.length === 3 || hex.length === 4) {
    const r = Number.parseInt(hex[0] + hex[0], 16) / 255;
    const g = Number.parseInt(hex[1] + hex[1], 16) / 255;
    const b = Number.parseInt(hex[2] + hex[2], 16) / 255;
    const a =
      hex.length === 4 ? Number.parseInt(hex[3] + hex[3], 16) / 255 : 1;
    return { r, g, b, a };
  }

  const r = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const g = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const b = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function parseRgbColor(value) {
  const match = value.match(/^rgba?\((.+)\)$/i);
  if (!match) {
    throw new Error(`Unsupported rgb color: ${value}`);
  }

  const rawParts = match[1].includes("/")
    ? match[1]
        .replace(/\s*\/\s*/, ",")
        .split(",")
        .map((part) => part.trim())
    : match[1].split(",").map((part) => part.trim());

  if (rawParts.length < 3) {
    throw new Error(`Invalid rgb color: ${value}`);
  }

  const [rPart, gPart, bPart, aPart] = rawParts;
  const r = clamp01(normalizeNumber(rPart) / (rPart.endsWith("%") ? 1 : 255));
  const g = clamp01(normalizeNumber(gPart) / (gPart.endsWith("%") ? 1 : 255));
  const b = clamp01(normalizeNumber(bPart) / (bPart.endsWith("%") ? 1 : 255));
  const a = aPart ? clamp01(normalizeNumber(aPart)) : 1;
  return { r, g, b, a };
}

function composite(source, backdrop) {
  const as = clamp01(source.a);
  const ab = clamp01(backdrop.a);
  const ao = as + ab * (1 - as);
  if (ao === 0) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  return {
    r: (as * source.r + ab * backdrop.r * (1 - as)) / ao,
    g: (as * source.g + ab * backdrop.g * (1 - as)) / ao,
    b: (as * source.b + ab * backdrop.b * (1 - as)) / ao,
    a: ao,
  };
}

function srgbToLinear(channel) {
  if (channel <= 0.04045) {
    return channel / 12.92;
  }
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color) {
  return (
    0.2126 * srgbToLinear(color.r) +
    0.7152 * srgbToLinear(color.g) +
    0.0722 * srgbToLinear(color.b)
  );
}

function contrastRatio(foreground, background) {
  const luminanceForeground = relativeLuminance(foreground);
  const luminanceBackground = relativeLuminance(background);
  const lighter = Math.max(luminanceForeground, luminanceBackground);
  const darker = Math.min(luminanceForeground, luminanceBackground);
  return {
    ratio: (lighter + 0.05) / (darker + 0.05),
    luminanceForeground,
    luminanceBackground,
  };
}

function formatHex(color) {
  const toHex = (component) =>
    Math.round(clamp01(component) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function formatRgba(color) {
  const r = Math.round(clamp01(color.r) * 255);
  const g = Math.round(clamp01(color.g) * 255);
  const b = Math.round(clamp01(color.b) * 255);
  const alpha = Number(color.a.toFixed(4));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildTheme(theme, rootTheme) {
  return {
    selector: theme.selector,
    label: theme.label,
    sourceFile: theme.sourceFile,
    declarations: { ...rootTheme.declarations, ...theme.declarations },
  };
}

function resolveValue(theme, token, stack = new Set()) {
  if (stack.has(token)) {
    throw new Error(`Circular token reference detected for ${token}`);
  }
  stack.add(token);
  const rawValue = theme.declarations[token];
  if (!rawValue) {
    stack.delete(token);
    return null;
  }
  const directVarMatch = rawValue.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
  if (directVarMatch) {
    const resolved = resolveValue(theme, directVarMatch[1], stack);
    stack.delete(token);
    return resolved ?? (directVarMatch[2] ? directVarMatch[2].trim() : null);
  }
  stack.delete(token);
  return rawValue.trim();
}

function splitTopLevel(value, separator = ",") {
  const parts = [];
  let current = "";
  let depth = 0;
  for (const char of value) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

function parseColorStop(theme, raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.*?)(?:\s+([\d.]+%))?$/);
  if (!match) {
    throw new Error(`Unable to parse color stop: ${raw}`);
  }
  return {
    color: parseColorValue(theme, match[1].trim()),
    percent: match[2] ? normalizeNumber(match[2]) : null,
  };
}

function mixColors(left, right, leftWeight, rightWeight) {
  const total = leftWeight + rightWeight;
  const normalizedLeft = total === 0 ? 0.5 : leftWeight / total;
  const normalizedRight = total === 0 ? 0.5 : rightWeight / total;
  return {
    r: clamp01(left.r * normalizedLeft + right.r * normalizedRight),
    g: clamp01(left.g * normalizedLeft + right.g * normalizedRight),
    b: clamp01(left.b * normalizedLeft + right.b * normalizedRight),
    a: clamp01(left.a * normalizedLeft + right.a * normalizedRight),
  };
}

function parseColorMix(theme, value) {
  const body = value.slice("color-mix(".length, -1).trim();
  if (!body.startsWith("in srgb,")) {
    throw new Error(`Unsupported color-mix space: ${value}`);
  }
  const parts = splitTopLevel(body.slice("in srgb,".length));
  if (parts.length !== 2) {
    throw new Error(`Unsupported color-mix stop count: ${value}`);
  }
  const left = parseColorStop(theme, parts[0]);
  const right = parseColorStop(theme, parts[1]);
  const leftWeight =
    left.percent ?? (right.percent === null ? 0.5 : 1 - right.percent);
  const rightWeight =
    right.percent ?? (left.percent === null ? 0.5 : 1 - left.percent);
  return mixColors(left.color, right.color, leftWeight, rightWeight);
}

function parseColorValue(theme, value) {
  const normalized = namedColors[value.toLowerCase()] ?? value;
  if (normalized.startsWith("#")) {
    return parseHexColor(normalized);
  }
  if (/^rgba?\(/i.test(normalized)) {
    return parseRgbColor(normalized);
  }
  if (/^var\(/i.test(normalized)) {
    const varMatch = normalized.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
    if (!varMatch) {
      throw new Error(`Unsupported var() syntax: ${value}`);
    }
    const resolved = resolveValue(theme, varMatch[1]);
    if (resolved) {
      return parseColorValue(theme, resolved);
    }
    if (varMatch[2]) {
      return parseColorValue(theme, varMatch[2].trim());
    }
    throw new Error(`Missing token ${varMatch[1]} in ${theme.selector}`);
  }
  if (/^color-mix\(/i.test(normalized)) {
    return parseColorMix(theme, normalized);
  }
  throw new Error(`Unsupported color format: ${value}`);
}

function parseTokenColor(theme, token) {
  const raw = resolveValue(theme, token);
  if (!raw) {
    throw new Error(`Missing value for ${token} in ${theme.selector}`);
  }
  const color = parseColorValue(theme, raw);
  return {
    token,
    raw,
    color,
    hex: formatHex(color),
    rgba: formatRgba(color),
  };
}

function compositeSurface(theme, bgToken, bgLayers = []) {
  const fallback = { r: 1, g: 1, b: 1, a: 1 };
  const parsedLayers = [bgToken, ...bgLayers].map((token) => parseTokenColor(theme, token));
  let effective = fallback;
  for (let index = parsedLayers.length - 1; index >= 0; index -= 1) {
    effective = composite(parsedLayers[index].color, effective);
  }
  return {
    effective,
    layers: parsedLayers.map((layer) => ({
      token: layer.token,
      raw: layer.raw,
      hex: layer.hex,
      rgba: layer.rgba,
      alpha: Number(layer.color.a.toFixed(4)),
    })),
  };
}

function buildTextResult(theme, spec, state, surface) {
  const backgroundSurface = compositeSurface(theme, surface.token, surface.layers);
  const foreground = parseTokenColor(theme, spec.textFgToken);
  const background = spec.stateBgTokens[state]
    ? parseTokenColor(theme, spec.stateBgTokens[state])
    : null;
  const effectiveBackground = background
    ? composite(background.color, backgroundSurface.effective)
    : backgroundSurface.effective;
  const effectiveForeground = composite(foreground.color, effectiveBackground);
  const contrast = contrastRatio(effectiveForeground, effectiveBackground);

  return {
    theme: theme.label,
    theme_selector: theme.selector,
    source_file: theme.sourceFile,
    component: spec.id,
    component_label: spec.label,
    check_type: "text",
    state,
    surface: surface.id,
    fg: {
      token: foreground.token,
      raw: foreground.raw,
      hex: formatHex(effectiveForeground),
      rgba: formatRgba(effectiveForeground),
      alpha: Number(foreground.color.a.toFixed(4)),
    },
    bg: {
      token: background ? background.token : surface.token,
      raw: background ? background.raw : surface.token,
      hex: formatHex(effectiveBackground),
      rgba: formatRgba(effectiveBackground),
      alpha: Number(effectiveBackground.a.toFixed(4)),
      layers: backgroundSurface.layers,
    },
    computed: {
      contrast_ratio: Number(contrast.ratio.toFixed(2)),
      luminance_fg: Number(contrast.luminanceForeground.toFixed(4)),
      luminance_bg: Number(contrast.luminanceBackground.toFixed(4)),
      method: "computed",
    },
    threshold: spec.textThreshold,
    pass: contrast.ratio >= spec.textThreshold,
    note:
      background === null
        ? "Link-style text contrast against the surrounding surface."
        : "Button label/icon contrast against the effective button background.",
  };
}

function buildBoundaryResult(theme, spec, state, surface) {
  const parentSurface = compositeSurface(theme, surface.token, surface.layers);
  const background = parseTokenColor(theme, spec.stateBgTokens[state]);
  const border = parseTokenColor(theme, spec.stateBorderTokens[state]);
  const effectiveBackground = composite(background.color, parentSurface.effective);
  const effectiveBorder = composite(border.color, parentSurface.effective);
  const fillContrast = contrastRatio(effectiveBackground, parentSurface.effective);
  const borderContrast = contrastRatio(effectiveBorder, parentSurface.effective);
  const strongest = fillContrast.ratio >= borderContrast.ratio ? "fill" : "border";
  const strongestRatio = strongest === "fill" ? fillContrast.ratio : borderContrast.ratio;

  return {
    theme: theme.label,
    theme_selector: theme.selector,
    source_file: theme.sourceFile,
    component: spec.id,
    component_label: spec.label,
    check_type: "boundary",
    state,
    surface: surface.id,
    fg: {
      token: border.token,
      raw: border.raw,
      hex: formatHex(effectiveBorder),
      rgba: formatRgba(effectiveBorder),
      alpha: Number(border.color.a.toFixed(4)),
    },
    bg: {
      token: background.token,
      raw: background.raw,
      hex: formatHex(effectiveBackground),
      rgba: formatRgba(effectiveBackground),
      alpha: Number(effectiveBackground.a.toFixed(4)),
      layers: parentSurface.layers,
    },
    computed: {
      fill_contrast_ratio: Number(fillContrast.ratio.toFixed(2)),
      border_contrast_ratio: Number(borderContrast.ratio.toFixed(2)),
      contrast_ratio: Number(strongestRatio.toFixed(2)),
      contrast_source: strongest,
      method: "computed",
    },
    threshold: spec.boundaryThreshold,
    pass: strongestRatio >= spec.boundaryThreshold,
    note:
      "Button must remain visually distinct from the adjacent surface through its fill or its border.",
  };
}

function buildFocusResult(theme, surface) {
  const parentSurface = compositeSurface(theme, surface.token, surface.layers);
  const ring = parseTokenColor(theme, focusSpec.ringToken);
  const offset = parseTokenColor(theme, focusSpec.offsetToken);
  const effectiveRing = composite(ring.color, parentSurface.effective);
  const effectiveOffset = composite(offset.color, parentSurface.effective);
  const ringContrast = contrastRatio(effectiveRing, parentSurface.effective);
  const offsetContrast = contrastRatio(effectiveOffset, parentSurface.effective);

  const strongestRatio = Math.max(ringContrast.ratio, offsetContrast.ratio);
  return {
    theme: theme.label,
    theme_selector: theme.selector,
    source_file: theme.sourceFile,
    component: focusSpec.id,
    component_label: focusSpec.label,
    check_type: "focus",
    state: "focus-visible",
    surface: surface.id,
    fg: {
      token: ring.token,
      raw: ring.raw,
      hex: formatHex(effectiveRing),
      rgba: formatRgba(effectiveRing),
      alpha: Number(ring.color.a.toFixed(4)),
    },
    bg: {
      token: offset.token,
      raw: offset.raw,
      hex: formatHex(effectiveOffset),
      rgba: formatRgba(effectiveOffset),
      alpha: Number(effectiveOffset.a.toFixed(4)),
      layers: parentSurface.layers,
    },
    computed: {
      ring_to_surface_ratio: Number(ringContrast.ratio.toFixed(2)),
      offset_to_surface_ratio: Number(offsetContrast.ratio.toFixed(2)),
      contrast_ratio: Number(strongestRatio.toFixed(2)),
      method: "computed",
    },
    threshold: focusSpec.threshold,
    pass: strongestRatio >= focusSpec.threshold,
    note:
      "Approximation of focus-indicator visibility against the adjacent surface. Either the ring or the offset band can satisfy the 3:1 color requirement; area requirements still need runtime review.",
  };
}

function buildLinkResults(theme) {
  const results = [];
  for (const [state, fgToken] of Object.entries(linkSpec.fgTokens)) {
    for (const surface of surfaces.filter((candidate) =>
      linkSpec.surfaces.includes(candidate.id)
    )) {
      const spec = {
        id: linkSpec.id,
        label: linkSpec.label,
        textThreshold: linkSpec.textThreshold,
        textFgToken: fgToken,
        stateBgTokens: {},
      };
      results.push(buildTextResult(theme, spec, state, surface));
    }
  }
  return results;
}

function recommendationFor(result) {
  if (result.pass) return "No change required.";
  if (result.check_type === "text") {
    return `Increase contrast between ${result.component_label.toLowerCase()} text and ${result.state} background in ${result.surface} context.`;
  }
  if (result.check_type === "focus") {
    return "Strengthen the focus ring color so it stays at or above 3:1 against the surrounding surface.";
  }
  return `Strengthen the ${result.component_label.toLowerCase()} fill or border so the control boundary clears 3:1 against the ${result.surface} surface.`;
}

function summarizeByTheme(results) {
  const grouped = new Map();
  for (const result of results) {
    const key = result.theme_selector;
    const summary = grouped.get(key) ?? {
      theme: result.theme,
      theme_selector: result.theme_selector,
      source_file: result.source_file,
      total_checks: 0,
      failing_checks: 0,
      failing_components: new Set(),
    };
    summary.total_checks += 1;
    if (!result.pass) {
      summary.failing_checks += 1;
      summary.failing_components.add(result.component);
    }
    grouped.set(key, summary);
  }
  return [...grouped.values()].map((summary) => ({
    theme: summary.theme,
    theme_selector: summary.theme_selector,
    source_file: summary.source_file,
    total_checks: summary.total_checks,
    failing_checks: summary.failing_checks,
    failing_components: [...summary.failing_components].sort(),
    status: summary.failing_checks === 0 ? "pass" : "fail",
  }));
}

function withoutVolatileTimestamp(report) {
  const clone = JSON.parse(JSON.stringify(report));
  if (clone?.meta) {
    delete clone.meta.audit_timestamp;
  }
  return JSON.stringify(clone);
}

function preserveTimestampIfReportMatches(report) {
  if (!fs.existsSync(outputJsonPath)) return report;
  try {
    const previous = JSON.parse(fs.readFileSync(outputJsonPath, "utf8"));
    if (withoutVolatileTimestamp(previous) === withoutVolatileTimestamp(report)) {
      report.meta.audit_timestamp = previous.meta.audit_timestamp;
    }
  } catch {
    // If the previous report cannot be parsed, write a fresh report below.
  }
  return report;
}

function writeFileIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === content) {
    return false;
  }
  fs.writeFileSync(filePath, content);
  return true;
}

function run() {
  const rawThemes = collectThemes();
  const rootTheme = rawThemes.find((theme) => theme.selector === ":root");
  if (!rootTheme) {
    throw new Error("Unable to locate :root theme tokens.");
  }

  const auditedThemes = rawThemes.map((theme) => buildTheme(theme, rootTheme));
  const results = [];

  for (const theme of auditedThemes) {
    for (const spec of buttonSpecs) {
      for (const state of Object.keys(spec.stateBgTokens)) {
        for (const surface of surfaces) {
          results.push(buildTextResult(theme, spec, state, surface));
          results.push(buildBoundaryResult(theme, spec, state, surface));
        }
      }
    }

    results.push(...buildLinkResults(theme));

    for (const surface of surfaces) {
      results.push(buildFocusResult(theme, surface));
    }
  }

  const themeSummary = summarizeByTheme(results);
  const failingResults = results.filter((result) => !result.pass);
  const failingThemes = themeSummary
    .filter((theme) => theme.failing_checks > 0)
    .map((theme) => theme.theme);

  const jsonReport = {
    meta: {
      wcag_version_targets: ["WCAG 2.1", "WCAG 2.2"],
      conformance_levels: ["AA baseline"],
      audit_timestamp: new Date().toISOString(),
      tool_assumptions: [
        "Theme tokens were read from src/styles/theme/base.css and src/styles/theme/variants.css.",
        "Button checks treat normal text contrast as 4.5:1 and component boundary contrast as 3:1.",
        "Alpha colors are composited with WCAG source-over math before luminance and contrast calculations.",
        "color-mix() tokens are resolved as sRGB weighted blends prior to surface compositing.",
        "Link-style button text is audited against card surfaces, which matches its intended use in this codebase.",
        "Focus validation checks color contrast only; focus-indicator area and obstruction still need runtime review.",
      ],
      theme_sources: inputFiles.map((filePath) =>
        path.relative(root, filePath).replace(/\\/g, "/")
      ),
    },
    themes: themeSummary,
    findings: results.map((result) => ({
      ...result,
      recommendation: recommendationFor(result),
    })),
    summary: {
      theme_count: auditedThemes.length,
      total_checks: results.length,
      failing_checks: failingResults.length,
      failing_themes: failingThemes,
      failing_components: [...new Set(failingResults.map((result) => result.component))].sort(),
    },
  };

  preserveTimestampIfReportMatches(jsonReport);

  const themeRows = themeSummary.map(
    (theme) =>
      `| ${theme.theme} | ${theme.total_checks} | ${theme.failing_checks} | ${theme.failing_components.length > 0 ? theme.failing_components.join(", ") : "None"} |`
  );

  const failureRows = failingResults
    .sort((left, right) => left.computed.contrast_ratio - right.computed.contrast_ratio)
    .map(
      (result) =>
        `| ${result.theme} | ${result.component_label} | ${result.check_type} | ${result.state} | ${result.surface} | ${result.computed.contrast_ratio.toFixed(2)}:1 | ${result.threshold}:1 | ${recommendationFor(result)} |`
    );

  const markdown = `# Button Contrast Report

## Summary

This audit validates semantic button tokens across every declared theme for text/icon contrast, component boundary contrast, link-style button text contrast, and focus-ring visibility. It covers ${auditedThemes.length} theme scopes and ${results.length} total checks across page and card surfaces.

AA status: ${failingThemes.length === 0 ? "all audited theme button states pass" : `${failingThemes.length} theme scopes still have failing button checks`}.

## Theme Summary

| theme | total checks | failing checks | failing components |
| --- | ---: | ---: | --- |
${themeRows.join("\n")}

## Failures

| theme | component | check | state | surface | ratio | threshold | recommendation |
| --- | --- | --- | --- | --- | ---: | ---: | --- |
${failureRows.length > 0 ? failureRows.join("\n") : "| None | None | None | None | None | None | None | All button checks pass. |"}

## Re-run

\`\`\`bash
node scripts/check-button-contrast.mjs
\`\`\`
`;

  const wroteJson = writeFileIfChanged(
    outputJsonPath,
    `${JSON.stringify(jsonReport, null, 2)}\n`
  );
  const wroteMarkdown = writeFileIfChanged(outputMarkdownPath, `${markdown}\n`);

  if (wroteJson || wroteMarkdown) {
    console.log(
      `Generated ${path.relative(root, outputMarkdownPath)} and ${path.relative(
        root,
        outputJsonPath
      )}.`
    );
  } else {
    console.log("[button-contrast] Reports already up to date.");
  }

  if (failingResults.length > 0) {
    process.exitCode = 1;
  }
}

try {
  run();
} catch (error) {
  console.error(
    `[button-contrast] ${error instanceof Error ? error.message : "Unknown error"}`
  );
  process.exitCode = 1;
}
