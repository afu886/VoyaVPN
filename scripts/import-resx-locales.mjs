import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const check = process.argv.includes("--check");
const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const localesDir = resolve(repoRoot, "packages/i18n/src/locales");
const overlaysDir = resolve(repoRoot, "packages/i18n/src/overlays");
const referenceResxDir = resolve(
  process.env.VOYAVPN_V2RAYN_RESX_DIR ?? resolve(repoRoot, "../v2rayN/v2rayN/ServiceLib/Resx"),
);

const localeImports = [
  { code: "en", resx: "ResUI.resx" },
  { code: "zh-Hans", resx: "ResUI.zh-Hans.resx" },
  { code: "zh-Hant", resx: "ResUI.zh-Hant.resx" },
  { code: "fr", resx: "ResUI.fr.resx" },
  { code: "fa", resx: "ResUI.fa-Ir.resx" },
  { code: "hu", resx: "ResUI.hu.resx" },
  { code: "ru", resx: "ResUI.ru.resx" },
  { code: "de", resx: "ResUI.resx", note: "Voya-managed English fallback; no upstream v2rayN ResUI.de.resx exists." },
];

const neutralResxPath = resolve(referenceResxDir, "ResUI.resx");
const hasUpstreamResx = existsSync(neutralResxPath);
const neutralResx = hasUpstreamResx ? parseResx(readFileSync(neutralResxPath, "utf8")) : null;
const overlays = Object.fromEntries(localeImports.map(({ code }) => [code, readOverlayJson(code)]));
const changed = [];

validateOverlayAlignment(overlays);

if (!hasUpstreamResx) {
  console.log(
    `v2rayN neutral ResUI resource is not available at ${neutralResxPath}; preserving the checked-in ResX snapshots while processing Voya overlays.`,
  );
}

mkdirSync(localesDir, { recursive: true });

for (const locale of localeImports) {
  const localePath = resolve(localesDir, `${locale.code}.json`);
  const current = readLocaleJson(locale.code);
  const appResources = overlays[locale.code];
  const resx = hasUpstreamResx
    ? mergeUpstreamResx(locale, neutralResx)
    : readCheckedInResx(locale.code, current);
  const nextResources = sortObject({
    ...appResources,
    resx: sortObject(resx),
  });
  const next = `${JSON.stringify(nextResources, null, 2)}\n`;
  const currentText = existsSync(localePath) ? readFileSync(localePath, "utf8") : "";

  if (currentText !== next) {
    changed.push(relative(repoRoot, localePath));
    if (!check) {
      writeFileSync(localePath, next);
    }
  }
}

if (check && changed.length > 0) {
  console.error("i18n locale files are out of date. Run `pnpm i18n:import`.");
  for (const file of changed) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

if (changed.length > 0) {
  console.log(`Generated ${changed.length} locale file(s):`);
  for (const file of changed) {
    console.log(`- ${file}`);
  }
} else {
  console.log("i18n locale files are up to date.");
}

function readLocaleJson(locale) {
  const localePath = resolve(localesDir, `${locale}.json`);

  if (!existsSync(localePath)) {
    return null;
  }

  return JSON.parse(readFileSync(localePath, "utf8"));
}

function readOverlayJson(locale) {
  const overlayPath = resolve(overlaysDir, `${locale}.json`);

  if (!existsSync(overlayPath)) {
    throw new Error(`Missing Voya locale overlay: ${relative(repoRoot, overlayPath)}`);
  }

  const overlay = JSON.parse(readFileSync(overlayPath, "utf8"));

  if (!isPlainObject(overlay) || Object.hasOwn(overlay, "resx")) {
    throw new Error(`Voya locale overlay must be an object without a resx namespace: ${relative(repoRoot, overlayPath)}`);
  }

  return overlay;
}

function mergeUpstreamResx(locale, neutral) {
  const localizedResxPath = resolve(referenceResxDir, locale.resx);
  const localizedResx = existsSync(localizedResxPath)
    ? parseResx(readFileSync(localizedResxPath, "utf8"))
    : {};

  return { ...neutral, ...localizedResx };
}

function readCheckedInResx(locale, current) {
  const resx = current?.resx;

  if (!isPlainObject(resx) || Object.keys(resx).length === 0) {
    throw new Error(
      `Cannot process ${locale} without upstream ResX or a checked-in locale snapshot containing resx resources.`,
    );
  }

  return resx;
}

function validateOverlayAlignment(resources) {
  const englishKeys = flattenResourceKeys(resources.en).sort();

  for (const { code } of localeImports) {
    const keys = flattenResourceKeys(resources[code]).sort();

    if (keys.length !== englishKeys.length || keys.some((key, index) => key !== englishKeys[index])) {
      const missing = englishKeys.filter((key) => !keys.includes(key));
      const extra = keys.filter((key) => !englishKeys.includes(key));
      throw new Error(
        `Voya locale overlay ${code} is not aligned with en (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`,
      );
    }
  }
}

function flattenResourceKeys(resources, prefix = "") {
  return Object.entries(resources).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPlainObject(value)) {
      return flattenResourceKeys(value, path);
    }

    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Voya locale overlay value must be a non-empty string: ${path}`);
    }

    return [path];
  });
}

function parseResx(source) {
  const entries = {};
  const xml = source.replace(/<!--[\s\S]*?-->/g, "");
  const dataPattern = /<data\s+([^>]*)>([\s\S]*?)<\/data>/g;
  let dataMatch = dataPattern.exec(xml);

  while (dataMatch) {
    const nameMatch = /\bname="([^"]+)"/.exec(dataMatch[1]);
    const valueMatch = /<value>([\s\S]*?)<\/value>/.exec(dataMatch[2]);

    if (nameMatch && valueMatch) {
      const key = decodeXml(nameMatch[1]);
      const value = decodeXml(valueMatch[1]).replaceAll("\r\n", "\n");

      if (value.length > 0) {
        entries[key] = value;
      }
    }

    dataMatch = dataPattern.exec(xml);
  }

  return entries;
}

function decodeXml(value) {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#([0-9]+);/gu, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)));
}

function sortObject(value) {
  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObject(entry)]),
  );
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
