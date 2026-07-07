import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appBundle = resolve(repoRoot, "target", "release", "bundle", "macos", "VoyaVPN.app");

function run(program, args, env = process.env) {
  const result = spawnSync(program, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function runOptional(program, args, env = process.env) {
  const result = spawnSync(program, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  return result.status ?? 1;
}

function capture(program, args) {
  const result = spawnSync(program, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function developerIdIdentity() {
  const explicit = process.env.VOYAVPN_CODESIGN_IDENTITY?.trim();
  if (explicit) {
    return explicit;
  }

  const identities = capture("security", ["find-identity", "-p", "codesigning"]);
  for (const line of identities.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+\)\s+([A-Fa-f0-9]+)\s+"([^"]*Developer ID Application[^"]+)"$/);
    if (match) {
      return match[1];
    }
  }

  throw new Error("No Developer ID Application signing identity found. Set VOYAVPN_CODESIGN_IDENTITY and retry.");
}

function requireMacos() {
  if (process.platform !== "darwin") {
    throw new Error("pnpm build:mac must run on macOS.");
  }
}

function main() {
  requireMacos();

  const identity = developerIdIdentity();
  const commonEnv = {
    ...process.env,
    VOYAVPN_MACOS_APP_BUNDLE: appBundle,
    VOYAVPN_CODESIGN_IDENTITY: identity,
    VOYAVPN_MACOS_DISTRIBUTION: "developer-id",
    VOYAVPN_REQUIRE_PROVISIONING: "1",
  };
  const tunnelEnv = {
    ...commonEnv,
    VOYAVPN_REQUIRE_LIBBOX: "1",
  };
  const verifyEnv = {
    ...tunnelEnv,
    VOYAVPN_REQUIRE_CODESIGN: "1",
    VOYAVPN_REQUIRE_NOTARIZATION_READY: "1",
  };

  console.log("Building local macOS TUN test app. Apple notarization is intentionally skipped.");
  console.log(`Output: ${appBundle}`);

  run("pnpm", ["tauri:build"], commonEnv);
  run("pnpm", ["native:macos:tunnel"], tunnelEnv);
  run("pnpm", ["native:macos:app:sign"], commonEnv);
  run("pnpm", ["native:macos:tunnel:verify"], verifyEnv);
  runOptional("xattr", ["-dr", "com.apple.quarantine", appBundle], commonEnv);

  console.log("");
  console.log("macOS TUN test app is ready:");
  console.log(`  ${appBundle}`);
  console.log("");
  console.log("Open it with:");
  console.log(`  open -n ${JSON.stringify(appBundle)}`);
  console.log("");
  console.log("Do not use pnpm dev for macOS TUN testing; it does not bundle PacketTunnel.appex.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
