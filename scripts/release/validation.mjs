export function missingExpectedValues(expected, present) {
  return expected.filter((value) => !present.has(value));
}

export function isSha256Hex(value) {
  return /^[a-f0-9]{64}$/i.test(value ?? "");
}

export function isPositiveByteSize(value) {
  return Number.isInteger(value) && value > 0;
}

export function isUrlDerivedFromBase(url, baseUrl) {
  return url?.startsWith(`${baseUrl}/`);
}

export function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function defaultEvidencePath(outputPath) {
  const name = basename(outputPath);
  const dot = name.lastIndexOf(".");
  const evidenceName = dot === -1 ? `${name}.evidence.json` : `${name.slice(0, dot)}.evidence.json`;
  return join(dirname(outputPath), evidenceName);
}

export function sourceInputEvidence(inputPath, repoRoot, productionKind = "workflow-artifact") {
  const relativePath = relative(repoRoot, inputPath).replaceAll("\\", "/") || ".";
  const isFixture = relativePath === "tests/fixtures" || relativePath.startsWith("tests/fixtures/");
  return {
    path: inputPath,
    relativePath,
    kind: isFixture ? "fixture" : productionKind,
    nonPublishableFixture: isFixture,
  };
}

export async function walkArtifactManifests(root) {
  let rootStat;
  try {
    rootStat = await stat(root);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  if (rootStat.isFile()) {
    return basename(root) === "artifact-manifest.json" ? [root] : [];
  }

  const manifests = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      manifests.push(...(await walkArtifactManifests(path)));
    } else if (entry.isFile() && entry.name === "artifact-manifest.json") {
      manifests.push(path);
    }
  }
  return manifests.sort((left, right) => left.localeCompare(right));
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", resolvePromise);
  });
  return hash.digest("hex");
}
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
