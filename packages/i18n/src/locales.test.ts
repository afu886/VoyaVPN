import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { changeLocale, getLocaleDirection, i18next, localeOptions, type Locale } from "./index";

type LocaleTree = {
  [key: string]: LocaleTree | string;
};

const desktopSourceRoot = resolve(findRepoRoot(process.cwd()), "apps/desktop/src");
const overlaysRoot = resolve(findRepoRoot(process.cwd()), "packages/i18n/src/overlays");
const sourceModules = readSourceModules(desktopSourceRoot);

describe("i18n locales", () => {
  it("registers the full product locale set", () => {
    expect(localeOptions.map((locale) => locale.code)).toEqual([
      "en",
      "zh-Hans",
      "zh-Hant",
      "fr",
      "fa",
      "hu",
      "ru",
      "de",
    ]);
    expect(getLocaleDirection("fa")).toBe("rtl");
    expect(localeOptions.filter((locale) => locale.direction === "rtl").map((locale) => locale.code)).toEqual(["fa"]);
  });

  it("keeps every locale aligned to the English key set", () => {
    const englishKeys = flattenKeys(localeTree("en")).sort();

    for (const locale of localeOptions) {
      const localeKeys = flattenKeys(localeTree(locale.code)).sort();
      expect(localeKeys).toEqual(englishKeys);

      for (const key of localeKeys) {
        expect(getValue(localeTree(locale.code), key)).not.toBe("");
      }
    }
  });

  it("generates Voya-owned resources from aligned locale overlays", () => {
    const englishOverlay = readLocaleFile(resolve(overlaysRoot, "en.json"));
    const englishKeys = flattenKeys(englishOverlay).sort();

    for (const locale of localeOptions) {
      const overlay = readLocaleFile(resolve(overlaysRoot, `${locale.code}.json`));
      const generated = { ...localeTree(locale.code) };

      delete generated.resx;

      expect(flattenKeys(overlay).sort(), locale.code).toEqual(englishKeys);
      expect(generated, locale.code).toEqual(overlay);
    }
  });

  it("imports v2rayN ResUI resources into every locale", () => {
    const englishResx = localeTree("en").resx;

    expect(isLocaleTree(englishResx) ? Object.keys(englishResx).length : 0).toBeGreaterThan(500);

    for (const locale of localeOptions) {
      expect(getValue(localeTree(locale.code), "resx.BatchExportURLSuccessfully")).toBeTruthy();
      expect(getValue(localeTree(locale.code), "resx.SpeedDisplayText")).toBeTruthy();
    }
  });

  it("translates representative UI strings in Chinese locales (no English leakage)", () => {
    // Representative keys across the modern UI namespaces and the profiles
    // sub-domain that previously leaked English values into zh-Hans/zh-Hant.
    const translatedKeys = [
      "actions.connect",
      "actions.save",
      "actions.settings",
      "proxy.network",
      "confirm.deleteProfilesTitle",
      "menu.language",
      "menu.qr",
      "modal.language",
      "modal.theme",
      "options.autostart",
      "options.configTemplate.import",
      "options.configTemplate.invalidSourceUrl",
      "options.routeTemplateSource",
      "panes.logs.title",
      "panes.profiles.title",
      "panes.profiles.fields.flow",
      "panes.profiles.fields.host",
      "panes.subscriptions.empty",
      "qr.title",
      "status.connected",
      "tabs.profiles",
      "updates.title",
    ];
    const hasCjk = /[一-鿿]/;

    for (const locale of ["zh-Hans", "zh-Hant"] as const) {
      const tree = localeTree(locale);
      const english = localeTree("en");

      for (const key of translatedKeys) {
        const value = getValue(tree, key);

        expect(typeof value, `${locale}:${key}`).toBe("string");
        expect(value, `${locale}:${key}`).toMatch(hasCjk);
        expect(value, `${locale}:${key}`).not.toBe(getValue(english, key));
      }
    }
  });

  it("covers static translation keys used by app source", () => {
    const staticKeys = collectStaticTranslationKeys();

    expect(staticKeys.size).toBeGreaterThan(0);

    for (const locale of localeOptions) {
      const tree = localeTree(locale.code);

      for (const key of staticKeys) {
        expect(getValue(tree, key), `${locale.code}:${key}`).toBeTruthy();
      }
    }
  });

  it("applies RTL and LTR document metadata when language changes", async () => {
    await changeLocale("fa");
    expect(document.documentElement.lang).toBe("fa");
    expect(document.documentElement.dir).toBe("rtl");

    await changeLocale("de");
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dir).toBe("ltr");
  });
});

function localeTree(locale: Locale) {
  return i18next.getResourceBundle(locale, "translation") as LocaleTree;
}

function readLocaleFile(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as LocaleTree;
}

function flattenKeys(tree: LocaleTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

function getValue(tree: LocaleTree, path: string) {
  let current: LocaleTree | string | undefined = tree;

  for (const segment of path.split(".")) {
    if (!isLocaleTree(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function isLocaleTree(value: LocaleTree | string | undefined): value is LocaleTree {
  return typeof value === "object" && value !== null;
}

function collectStaticTranslationKeys() {
  const keys = new Set<string>();
  const staticTranslationKey = /\bt\(\s*["']([^"'`]+)["']/g;

  for (const [path, source] of sourceModules) {
    if (path === "ipc/bindings.ts") {
      continue;
    }

    let match = staticTranslationKey.exec(source);

    while (match) {
      keys.add(match[1]);
      match = staticTranslationKey.exec(source);
    }
  }

  return keys;
}

function readSourceModules(sourceRoot: string): Array<[string, string]> {
  const modules: Array<[string, string]> = [];

  visitSourceDir(sourceRoot, modules, sourceRoot);

  return modules;
}

function visitSourceDir(sourceRoot: string, modules: Array<[string, string]>, dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);

    if (entry.isDirectory()) {
      visitSourceDir(sourceRoot, modules, path);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      modules.push([relative(sourceRoot, path).replaceAll("\\", "/"), readFileSync(path, "utf8")]);
    }
  }
}

function findRepoRoot(start: string) {
  let dir = resolve(start);

  while (true) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }

    const parent = dirname(dir);

    if (parent === dir) {
      throw new Error("Unable to locate pnpm-workspace.yaml");
    }

    dir = parent;
  }
}
