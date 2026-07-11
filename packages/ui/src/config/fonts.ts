export const fonts = ["inter", "manrope", "system"] as const;

export type Font = (typeof fonts)[number];

export const DEFAULT_FONT: Font = "system";

/** GitHub Primer system-first sans stack (with CJK fallbacks). Keep in sync with
 *  --app-font-family / --font-system in globals.css. */
export const GITHUB_SANS_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';

type FontDefinition = {
  className: `font-${Font}`;
  css: string;
  label: string;
  persistedFamily: string;
};

export const fontDefinitions = {
  inter: {
    className: "font-inter",
    css: `Inter, ${GITHUB_SANS_STACK}`,
    label: "Inter",
    persistedFamily: "Inter",
  },
  manrope: {
    className: "font-manrope",
    css: `Manrope, ${GITHUB_SANS_STACK}`,
    label: "Manrope",
    persistedFamily: "Manrope",
  },
  system: {
    className: "font-system",
    css: GITHUB_SANS_STACK,
    label: "System",
    persistedFamily: "System",
  },
} satisfies Record<Font, FontDefinition>;

/**
 * Role-based typography (Safe Passage). The user-selectable {@link fonts} drive
 * the `body` role at runtime via `--app-font-family`; `display` (GitHub system
 * stack, tabular-nums for Hero timing/throughput numerals) and `mono` (logs /
 * connections / codemirror / data cells) are fixed roles surfaced as the
 * `--font-display` / `--font-mono` theme tokens in globals.css. Keep
 * MONO_FONT_STACK in sync with `--font-mono` there.
 */
export const MONO_FONT_STACK =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export const fontRoles = {
  display: fontDefinitions.system.css,
  body: "var(--app-font-family)",
  mono: MONO_FONT_STACK,
} as const;

export type FontRole = keyof typeof fontRoles;

export const fontOptions = fonts.map((font) => ({
  label: fontDefinitions[font].label,
  value: font,
}));

export function isFont(value: unknown): value is Font {
  return typeof value === "string" && fonts.includes(value as Font);
}

export function fontFromFamilyString(value: string | null | undefined): Font {
  const normalized = normalizeFamilyString(value);

  if (!normalized) {
    return DEFAULT_FONT;
  }

  if (normalized.includes("manrope")) {
    return "manrope";
  }

  if (normalized.includes("inter")) {
    return "inter";
  }

  if (
    normalized === "system" ||
    normalized.includes("font-system") ||
    normalized.includes("ui-sans-serif") ||
    normalized.includes("system-ui")
  ) {
    return "system";
  }

  return DEFAULT_FONT;
}

export function fontToClassName(font: Font) {
  return fontDefinitions[font].className;
}

export function fontToCss(font: Font) {
  return fontDefinitions[font].css;
}

export function fontToFamilyString(font: Font) {
  return fontDefinitions[font].persistedFamily;
}

function normalizeFamilyString(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replaceAll('"', "").replaceAll("'", "");
}
