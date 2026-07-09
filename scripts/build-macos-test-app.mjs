import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
const appBundle = resolve(repoRoot, "target", "release", "bundle", "macos", "VoyaVPN.app");
const appContents = resolve(appBundle, "Contents");
const dmgDir = resolve(repoRoot, "target", "release", "bundle", "dmg");

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

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

function withoutEnv(env, names) {
  const next = { ...env };
  for (const name of names) {
    delete next[name];
  }
  return next;
}

function signingIdentity(pattern, label) {
  const explicit = process.env.VOYAVPN_CODESIGN_IDENTITY?.trim();
  if (explicit) {
    return explicit;
  }

  const identities = capture("security", ["find-identity", "-p", "codesigning"]);
  for (const line of identities.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+\)\s+([A-Fa-f0-9]+)\s+"([^"]+)"$/);
    if (match) {
      const [, sha1, name] = match;
      if (pattern.test(name)) {
        return sha1;
      }
    }
  }

  throw new Error(`No ${label} signing identity found. Set VOYAVPN_CODESIGN_IDENTITY and retry.`);
}

function developerIdIdentity() {
  return signingIdentity(/Developer ID Application/, "Developer ID Application");
}

function localAppExtensionIdentity() {
  return signingIdentity(/Apple Development:|Mac Developer:/, "Apple Development or Mac Developer");
}

function requireMacos() {
  if (process.platform !== "darwin") {
    throw new Error("pnpm build:mac must run on macOS.");
  }
}

function skipNotarization() {
  return truthy(process.env.VOYAVPN_SKIP_NOTARIZATION);
}

function requireNotaryCredentials() {
  if (skipNotarization()) {
    return;
  }
  if (process.env.VOYAVPN_NOTARY_KEYCHAIN_PROFILE?.trim()) {
    return;
  }
  if (
    process.env.VOYAVPN_NOTARY_APPLE_ID?.trim()
    && process.env.VOYAVPN_NOTARY_TEAM_ID?.trim()
    && process.env.VOYAVPN_NOTARY_PASSWORD?.trim()
  ) {
    return;
  }
  throw new Error(
    "pnpm build:mac now produces notarized artifacts. Set VOYAVPN_NOTARY_KEYCHAIN_PROFILE, or VOYAVPN_NOTARY_APPLE_ID/TEAM_ID/PASSWORD.",
  );
}

function plistValue(plistPath, keyPath) {
  return capture("/usr/libexec/PlistBuddy", ["-c", `Print ${keyPath}`, plistPath]).trim();
}

function appExecutablePath() {
  const executable = plistValue(resolve(appContents, "Info.plist"), ":CFBundleExecutable");
  return resolve(appContents, "MacOS", executable);
}

function archSuffix() {
  const explicit = process.env.VOYAVPN_MACOS_DMG_ARCH?.trim();
  if (explicit) {
    return explicit;
  }

  const archs = capture("lipo", ["-archs", appExecutablePath()]).trim().split(/\s+/).filter(Boolean);
  const hasArm64 = archs.includes("arm64");
  const hasX64 = archs.includes("x86_64");
  if (hasArm64 && hasX64) {
    return "universal";
  }
  if (hasArm64) {
    return "aarch64";
  }
  if (hasX64) {
    return "x64";
  }
  return process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x64" : process.arch;
}

function dmgPath() {
  const explicit = process.env.VOYAVPN_MACOS_DMG_PATH?.trim();
  if (explicit) {
    return resolve(explicit);
  }
  return resolve(dmgDir, `VoyaVPN_${packageJson.version}_${archSuffix()}.dmg`);
}

function main() {
  requireMacos();
  requireNotaryCredentials();
  const notarizationSkipped = skipNotarization();

  const identity = notarizationSkipped ? localAppExtensionIdentity() : developerIdIdentity();
  const macosDistribution = notarizationSkipped ? "app-store" : "developer-id";
  const commonEnv = {
    ...process.env,
    VOYAVPN_MACOS_APP_BUNDLE: appBundle,
    VOYAVPN_CODESIGN_IDENTITY: identity,
    VOYAVPN_MACOS_DISTRIBUTION: macosDistribution,
    VOYAVPN_REQUIRE_PROVISIONING: "1",
    ...(notarizationSkipped ? { VOYAVPN_ALLOW_DEVELOPMENT_PROVISIONING: "1" } : {}),
  };
  const tunnelEnv = {
    ...commonEnv,
    VOYAVPN_REQUIRE_LIBBOX: "1",
  };
  const verifyEnv = {
    ...tunnelEnv,
    VOYAVPN_REQUIRE_CODESIGN: "1",
    ...(notarizationSkipped ? {} : { VOYAVPN_REQUIRE_NOTARIZATION_READY: "1" }),
  };

  console.log(
    notarizationSkipped
      ? "Building local macOS app with PacketTunnel appex. Apple notarization is skipped."
      : "Building notarized macOS app with PacketTunnel System Extension.",
  );
  console.log(`Output: ${appBundle}`);

  run("pnpm", ["tauri:build", "--bundles", "app"], commonEnv);
  run("pnpm", ["native:macos:tunnel"], tunnelEnv);
  run("pnpm", ["native:macos:app:sign"], commonEnv);
  run("pnpm", ["native:macos:tunnel:verify"], verifyEnv);

  if (!notarizationSkipped) {
    const appNotarizeEnv = withoutEnv(verifyEnv, ["VOYAVPN_NOTARY_ARTIFACT"]);
    run("pnpm", ["native:macos:app:notarize"], appNotarizeEnv);
    run("spctl", ["--assess", "--type", "execute", "--verbose=4", appBundle], verifyEnv);
  }

  const finalDmgPath = dmgPath();
  const dmgEnv = {
    ...verifyEnv,
    VOYAVPN_MACOS_DMG_PATH: finalDmgPath,
  };
  run("pnpm", ["native:macos:dmg"], dmgEnv);
  if (!notarizationSkipped) {
    run("pnpm", ["native:macos:app:notarize"], {
      ...dmgEnv,
      VOYAVPN_NOTARY_ARTIFACT: finalDmgPath,
    });
    run(
      "spctl",
      ["--assess", "--type", "open", "--context", "context:primary-signature", "--verbose=4", finalDmgPath],
      dmgEnv,
    );
  }

  runOptional("xattr", ["-dr", "com.apple.quarantine", appBundle], commonEnv);
  run(
    "node",
    ["scripts/macos-ne-doctor.mjs", "--fix", "--app", appBundle, "--dev"],
    commonEnv,
  );

  console.log("");
  console.log(notarizationSkipped ? "Local macOS TUN test app is ready:" : "Notarized macOS app is ready:");
  console.log(`  ${appBundle}`);
  console.log(`  ${finalDmgPath}`);
  console.log(
    notarizationSkipped
      ? "  PacketTunnel appex is staged and signed for local testing only."
      : "  PacketTunnel system extension is staged, signed, notarized, and ready for first-run approval.",
  );
  console.log("");
  console.log("Open it with:");
  console.log(`  open -n ${JSON.stringify(appBundle)}`);
  console.log("");
  console.log("Do not use pnpm dev for macOS TUN testing; it does not bundle the PacketTunnel provider.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
