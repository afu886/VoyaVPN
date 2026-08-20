import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { truthy } from "../lib/common.mjs";

function falsey(value) {
  return /^(0|false|no|off)$/i.test(String(value ?? "").trim());
}

function firstEnv(env, ...names) {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value !== null && String(value).trim().length > 0) {
      return String(value).trim();
    }
  }
  return null;
}

function placeholderText(value) {
  return (
    !value ||
    /placeholder|replace_before_release|replace-before-release|changeme|\btodo\b|\btbd\b|voyavpn\.example/i.test(
      String(value),
    )
  );
}

function forbiddenStableHost(hostname) {
  const host = hostname.toLowerCase();
  return (
    host === "example.com" ||
    host.endsWith(".example.com") ||
    host.endsWith(".example") ||
    host.includes("example") ||
    host === "github.com" ||
    host.endsWith(".github.com") ||
    host === "githubusercontent.com" ||
    host.endsWith(".githubusercontent.com") ||
    host === "github.io" ||
    host.endsWith(".github.io") ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".test") ||
    host.includes("placeholder")
  );
}

function stableUpdaterBaseUrl(env) {
  const value = firstEnv(env, "VOYAVPN_UPDATES_BASE_URL");
  if (!value) {
    throw new Error("VOYAVPN_UPDATES_BASE_URL is required for stable Tauri updater builds.");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`VOYAVPN_UPDATES_BASE_URL is not a valid URL: ${value}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`VOYAVPN_UPDATES_BASE_URL must use https for stable builds: ${value}`);
  }
  if (forbiddenStableHost(parsed.hostname)) {
    throw new Error(
      `VOYAVPN_UPDATES_BASE_URL must not use example, GitHub, placeholder, localhost, or .test hosts: ${value}`,
    );
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/g, "");
}

function stableUpdaterPublicKey(env) {
  const value = firstEnv(env, "VOYAVPN_UPDATER_PUBLIC_KEY", "TAURI_UPDATER_PUBLIC_KEY");
  if (placeholderText(value) || value.length < 32) {
    throw new Error("VOYAVPN_UPDATER_PUBLIC_KEY must be the approved non-placeholder Tauri updater public key.");
  }
  return value;
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function requestedStableUpdaterConfig(env = process.env) {
  const explicit = env.VOYAVPN_TAURI_UPDATER_CONFIG;
  if (explicit !== undefined) {
    if (truthy(explicit) || String(explicit).trim().toLowerCase() === "stable") return true;
    if (falsey(explicit)) return false;
    throw new Error("VOYAVPN_TAURI_UPDATER_CONFIG must be stable, true, or false.");
  }

  return (env.VOYAVPN_RELEASE_CHANNEL ?? env.RELEASE_CHANNEL ?? env.CHANNEL ?? "").trim().toLowerCase() === "stable";
}

export function normalizeCiEnv(source = process.env) {
  const env = { ...source };
  if (env.CI === "1") env.CI = "true";
  else if (env.CI === "0") env.CI = "false";
  return env;
}

export function writeStableUpdaterOverlay({ repoRoot, env = process.env }) {
  if (!firstEnv(env, "TAURI_SIGNING_PRIVATE_KEY", "TAURI_SIGNING_PRIVATE_KEY_PATH")) {
    throw new Error(
      "TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH is required when stable updater artifacts are enabled.",
    );
  }

  const baseUrl = stableUpdaterBaseUrl(env);
  const publicKey = stableUpdaterPublicKey(env);
  const endpoints = [`${baseUrl}/latest.json`];
  const overlay = {
    bundle: { createUpdaterArtifacts: true },
    plugins: {
      updater: {
        pubkey: publicKey,
        endpoints,
        windows: { installMode: "passive" },
      },
    },
  };
  const overlayPath = resolve(repoRoot, "target", "release-config", "tauri.updater.stable.generated.json");
  const metadataPath = resolve(
    repoRoot,
    "target",
    "release-config",
    "tauri.updater.stable.generated.metadata.json",
  );
  const overlayText = `${JSON.stringify(overlay, null, 2)}\n`;

  mkdirSync(dirname(overlayPath), { recursive: true });
  writeFileSync(overlayPath, overlayText);
  writeFileSync(
    metadataPath,
    `${JSON.stringify(
      {
        path: relative(repoRoot, overlayPath).replaceAll("\\", "/"),
        sha256: sha256Text(overlayText),
        pubkeySha256: sha256Text(publicKey),
        endpoints,
        createUpdaterArtifacts: true,
      },
      null,
      2,
    )}\n`,
  );
  return overlayPath;
}
