import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function requireDarwin(message) {
  if (process.platform !== "darwin") {
    throw new Error(message);
  }
}

export function repoRootFromScript(importMetaUrl = import.meta.url) {
  let directory = dirname(fileURLToPath(importMetaUrl));

  while (!existsSync(resolve(directory, "pnpm-workspace.yaml"))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`Unable to locate repository root from ${importMetaUrl}`);
    }
    directory = parent;
  }

  return directory;
}

export function isCliEntrypoint(importMetaUrl) {
  return process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href === importMetaUrl : false;
}

export function capture(program, args, options = {}) {
  return spawnSync(program, args, {
    ...options,
    encoding: "utf8",
  });
}

export function run(program, args, options = {}) {
  const result = capture(program, args, {
    ...options,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}`);
  }
  return result;
}
