import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import ts from "typescript";
import { repoRootFromScript } from "../lib/common.mjs";

const repoRoot = repoRootFromScript(import.meta.url);
const localesDir = resolve(repoRoot, "packages/i18n/src/locales");
const productionSourceDir = resolve(repoRoot, "apps/desktop/src");
const localeCodes = ["en", "zh-Hans", "zh-Hant", "fr", "fa", "hu", "ru", "de"];

const resources = Object.fromEntries(localeCodes.map((code) => [code, readLocale(code)]));
const englishKeys = flattenResourceKeys(resources.en).sort();
const knownKeys = new Set(englishKeys);

for (const code of localeCodes) {
  const keys = flattenResourceKeys(resources[code]).sort();
  if (keys.length !== englishKeys.length || keys.some((key, index) => key !== englishKeys[index])) {
    const missing = englishKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !englishKeys.includes(key));
    throw new Error(
      `Locale ${code} is not aligned with en (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}).`,
    );
  }
}

if (englishKeys.some((key) => key.startsWith("resx."))) {
  throw new Error("The retired resx translation namespace must not be reintroduced.");
}

const invalidKeys = [];
const dynamicKeys = [];
const hardcodedJsx = [];

for (const path of productionSourceFiles(productionSourceDir)) {
  inspectSource(path);
}

if (invalidKeys.length > 0) {
  throw new Error(`Production source references undefined translation keys:\n${formatList(invalidKeys)}`);
}
if (dynamicKeys.length > 0) {
  throw new Error(`Dynamic translation keys must use explicit translated values:\n${formatList(dynamicKeys)}`);
}
if (hardcodedJsx.length > 0) {
  throw new Error(`User-visible JSX text must use Voya locale resources:\n${formatList(hardcodedJsx)}`);
}

console.log(`i18n check passed: ${localeCodes.length} aligned Voya locales, ${englishKeys.length} keys.`);

function inspectSource(path) {
  const source = readFileSync(path, "utf8");
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  function visit(node) {
    if (ts.isCallExpression(node) && isTranslationCall(node.expression) && node.arguments.length > 0) {
      const [key] = node.arguments;
      if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) {
        validateStaticKey(sourceFile, path, key);
      } else if (ts.isConditionalExpression(key)) {
        validateStaticKey(sourceFile, path, key.whenTrue);
        validateStaticKey(sourceFile, path, key.whenFalse);
      } else if (ts.isTemplateExpression(key) || ts.isBinaryExpression(key)) {
        dynamicKeys.push(location(sourceFile, path, key, key.getText(sourceFile)));
      }
    }

    if (ts.isJsxText(node)) {
      const text = node.text.replace(/\s+/g, " ").trim();
      if (isUserVisibleText(text)) {
        hardcodedJsx.push(location(sourceFile, path, node, text));
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

function validateStaticKey(sourceFile, path, node) {
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) {
    dynamicKeys.push(location(sourceFile, path, node, node.getText(sourceFile)));
    return;
  }
  if (!knownKeys.has(node.text)) {
    invalidKeys.push(location(sourceFile, path, node, node.text));
  }
}

function readLocale(code) {
  const path = resolve(localesDir, `${code}.json`);
  if (!existsSync(path)) {
    throw new Error(`Missing directly maintained Voya locale: ${relative(repoRoot, path)}`);
  }
  const resource = JSON.parse(readFileSync(path, "utf8"));
  if (!isPlainObject(resource)) {
    throw new Error(`Locale root must be an object: ${relative(repoRoot, path)}`);
  }
  return resource;
}

function flattenResourceKeys(resource, prefix = "") {
  return Object.entries(resource).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      return flattenResourceKeys(value, path);
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`Locale value must be a non-empty string: ${path}`);
    }
    return [path];
  });
}

function isTranslationCall(expression) {
  return (ts.isIdentifier(expression) && expression.text === "t")
    || (ts.isPropertyAccessExpression(expression) && expression.name.text === "t");
}

function isUserVisibleText(text) {
  if (text.length === 0 || !/[A-Za-z\u3400-\u9fff]/u.test(text)) {
    return false;
  }
  return !/^(?:VoyaVPN|sing-box|HTTP|HTTPS|SOCKS|TCP|UDP|TLS|TUN|URL|JSON|QR|IP|IPv6|Mbps|KB\/s|MB\/s)$/u.test(text);
}

function location(sourceFile, path, node, detail) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${relative(repoRoot, path)}:${line + 1} ${detail}`;
}

function formatList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function productionSourceFiles(root) {
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && ["__tests__", "test", "tests"].includes(entry.name)) {
        continue;
      }
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (
        entry.isFile()
        && /\.(ts|tsx)$/.test(entry.name)
        && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)
        && entry.name !== "bindings.ts"
      ) {
        files.push(path);
      }
    }
  }
  visit(root);
  return files;
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
