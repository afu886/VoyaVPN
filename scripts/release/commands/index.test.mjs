import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { repoRootFromScript } from "../../lib/common.mjs";
import { main } from "./index.mjs";

const repoRoot = repoRootFromScript(import.meta.url);
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("release index", () => {
  it("preserves the stable target matrix and derives URLs from the approved base", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "voyavpn-release-index-"));
    temporaryDirectories.push(outputDir);
    const output = join(outputDir, "release-index.json");

    await main([
      "--input",
      resolve(repoRoot, "tests/fixtures/release/artifacts"),
      "--out",
      output,
      "--base-url",
      "https://cdn.voyavpn.dev/stable",
      "--channel",
      "stable",
    ]);

    const index = JSON.parse(await readFile(output, "utf8"));
    const evidence = JSON.parse(await readFile(join(outputDir, "release-index.evidence.json"), "utf8"));
    expect(index.artifacts).toHaveLength(6);
    expect(index.artifacts.every((artifact) => artifact.url.startsWith("https://cdn.voyavpn.dev/stable/"))).toBe(true);
    expect(evidence.firstStableTargetCount).toBe(6);
    expect(evidence.checksumCount).toBe(6);
  });

  it("fails closed for an example stable host", async () => {
    await expect(main([
      "--input",
      resolve(repoRoot, "tests/fixtures/release/artifacts"),
      "--out",
      resolve(repoRoot, "target/test-release-index.json"),
      "--base-url",
      "https://cdn.example.com/stable",
      "--channel",
      "stable",
    ])).rejects.toThrow(/example|production/i);
  });
});
