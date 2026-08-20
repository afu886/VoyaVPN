import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { ensureSingBoxSeedForBuild } from "../core/sing-box-installer.mjs";
import { isCliEntrypoint, repoRootFromScript } from "../lib/common.mjs";
import { writeOptionalCoreSeedOverlay } from "./core-seeds.mjs";
import {
  normalizeCiEnv,
  requestedStableUpdaterConfig,
  writeStableUpdaterOverlay,
} from "./stable-updater-config.mjs";

export async function prepareTauriInvocation(
  rawArgs,
  {
    repoRoot = repoRootFromScript(import.meta.url),
    sourceEnv = process.env,
    ensureSeed = ensureSingBoxSeedForBuild,
    writeCoreOverlay = writeOptionalCoreSeedOverlay,
    writeUpdaterOverlay = writeStableUpdaterOverlay,
  } = {},
) {
  const desktopRoot = resolve(repoRoot, "apps", "desktop");
  const localTauriJs = resolve(desktopRoot, "node_modules", "@tauri-apps", "cli", "tauri.js");
  const tauriArgs = rawArgs.length === 0 ? ["dev"] : [...rawArgs];
  const operation = tauriArgs[0];
  const env = operation === "build" ? normalizeCiEnv(sourceEnv) : { ...sourceEnv };

  if (operation === "build") {
    await ensureSeed({ repoRoot });
  }

  if (operation === "dev" || operation === "build") {
    const configRoot = operation === "build" ? "release-config" : "tauri-config";
    const coreSeedOverlayPath = writeCoreOverlay(
      repoRoot,
      resolve(repoRoot, "target", configRoot, "tauri.core-seeds.generated.json"),
    );
    if (coreSeedOverlayPath) {
      tauriArgs.splice(1, 0, "--config", coreSeedOverlayPath);
    }
  }

  if (operation === "build" && requestedStableUpdaterConfig(env)) {
    const overlayPath = writeUpdaterOverlay({ repoRoot, env });
    console.log(`Using stable Tauri updater config overlay: ${overlayPath}`);
    tauriArgs.splice(1, 0, "--config", overlayPath);
  }

  return {
    command: existsSync(localTauriJs) ? process.execPath : "tauri",
    commandArgs: existsSync(localTauriJs) ? [localTauriJs, ...tauriArgs] : tauriArgs,
    cwd: desktopRoot,
    env,
  };
}

export async function main(rawArgs = process.argv.slice(2)) {
  const invocation = await prepareTauriInvocation(rawArgs);
  const child = spawn(invocation.command, invocation.commandArgs, {
    cwd: invocation.cwd,
    env: invocation.env,
    shell: false,
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
  child.on("error", (error) => {
    console.error(error.message);
    process.exit(1);
  });
}

if (isCliEntrypoint(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
