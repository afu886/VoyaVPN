import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = resolve(repoRoot, "target", "native", "macos");
const appBundle = resolve(process.env.VOYAVPN_MACOS_APP_BUNDLE || resolve(repoRoot, "target", "native", "macos", "VoyaVPN.app"));
const appContents = resolve(appBundle, "Contents");
const appBundleIdentifier = "app.voyavpn.desktop";
const legacyTunnelHelper = resolve(appContents, "MacOS", "voyavpn-macos-tunnelctl");
const appProvisioningProfileDestination = resolve(appContents, "embedded.provisionprofile");
const appEntitlements = resolve(repoRoot, "src-tauri", "entitlements", "macos-app.plist");
const defaultProvisioningProfileDir = resolve(repoRoot, "..", "docs", "certs");
const provisioningProfileDir = resolve(process.env.VOYAVPN_PROVISIONING_PROFILE_DIR || defaultProvisioningProfileDir);
const generatedEntitlementsDir = resolve(outRoot, "generated-entitlements");

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function run(program, args) {
  const result = spawnSync(program, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}`);
  }
}

function runAllowFailure(program, args) {
  return spawnSync(program, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
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

function normalizeDistribution(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "auto") {
    return "auto";
  }
  if (["developer-id", "developerid", "notarized", "dmg"].includes(normalized)) {
    return "developer-id";
  }
  if (["app-store", "appstore", "testflight", "mas"].includes(normalized)) {
    return "app-store";
  }
  throw new Error("VOYAVPN_MACOS_DISTRIBUTION must be auto, developer-id, or app-store.");
}

function signingIdentityName(identity) {
  const list = capture("security", ["find-identity", "-p", "codesigning"]);
  const lines = list.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*\d+\)\s+([A-Fa-f0-9]+)\s+"(.+)"$/);
    if (!match) {
      continue;
    }
    const [, sha1, name] = match;
    if (identity === sha1 || identity === name || name.includes(identity)) {
      return name;
    }
  }
  return identity;
}

function distributionMode(identity) {
  const explicit = normalizeDistribution(process.env.VOYAVPN_MACOS_DISTRIBUTION);
  if (explicit !== "auto") {
    return explicit;
  }

  const name = signingIdentityName(identity);
  if (name.includes("3rd Party Mac Developer")) {
    return "app-store";
  }
  if (name.includes("Developer ID Application")) {
    return "developer-id";
  }
  return "developer-id";
}

function plistBuddy(plistPath, keyPath, optional = false) {
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print ${keyPath}`, plistPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    if (optional) {
      return "";
    }
    throw new Error(`Unable to read ${keyPath} from ${plistPath}: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function parsePlistArray(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "Array {" && line !== "}");
}

function collectProvisioningProfiles(root, results = []) {
  if (!existsSync(root)) {
    return results;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      collectProvisioningProfiles(path, results);
      continue;
    }
    const extension = extname(entry.name).toLowerCase();
    if (extension === ".provisionprofile" || extension === ".mobileprovision") {
      results.push(path);
    }
  }

  return results;
}

function decodeProvisioningProfile(profilePath) {
  const decoded = capture("security", ["cms", "-D", "-i", profilePath]);
  const decodedDir = resolve(outRoot, "decoded-provisioning-profiles");
  mkdirSync(decodedDir, { recursive: true });
  const plistPath = resolve(decodedDir, `${basename(profilePath)}.plist`);
  writeFileSync(plistPath, decoded);

  const applicationIdentifier = plistBuddy(plistPath, ":Entitlements:com.apple.application-identifier");
  const teamIdentifier = plistBuddy(plistPath, ":Entitlements:com.apple.developer.team-identifier", true)
    || plistBuddy(plistPath, ":TeamIdentifier:0", true);
  const bundleIdentifier = teamIdentifier && applicationIdentifier.startsWith(`${teamIdentifier}.`)
    ? applicationIdentifier.slice(teamIdentifier.length + 1)
    : applicationIdentifier.replace(/^[^.]+\./, "");

  return {
    path: profilePath,
    name: plistBuddy(plistPath, ":Name", true),
    applicationIdentifier,
    bundleIdentifier,
    teamIdentifier,
    appGroups: parsePlistArray(plistBuddy(plistPath, ":Entitlements:com.apple.security.application-groups", true)),
    keychainAccessGroups: parsePlistArray(plistBuddy(plistPath, ":Entitlements:keychain-access-groups", true)),
    networkExtensions: parsePlistArray(
      plistBuddy(plistPath, ":Entitlements:com.apple.developer.networking.networkextension", true),
    ),
  };
}

function provisioningProfile() {
  const explicit = process.env.VOYAVPN_MACOS_APP_PROVISIONING_PROFILE;
  if (explicit) {
    const profilePath = resolve(explicit);
    if (!existsSync(profilePath)) {
      throw new Error(`VOYAVPN_MACOS_APP_PROVISIONING_PROFILE points to a missing file: ${profilePath}`);
    }
    return decodeProvisioningProfile(profilePath);
  }

  for (const profilePath of collectProvisioningProfiles(provisioningProfileDir)) {
    const profile = decodeProvisioningProfile(profilePath);
    if (profile.bundleIdentifier === appBundleIdentifier) {
      return profile;
    }
  }

  return null;
}

function validateProvisioningProfile(profile) {
  if (profile.bundleIdentifier !== appBundleIdentifier) {
    throw new Error(`macOS app provisioning profile bundle id mismatch: expected ${appBundleIdentifier}, got ${profile.bundleIdentifier}.`);
  }
  if (!profile.appGroups.includes("group.app.voyavpn.desktop")) {
    throw new Error("macOS app provisioning profile does not include group.app.voyavpn.desktop.");
  }
  if (!profile.networkExtensions.includes("packet-tunnel-provider")) {
    throw new Error("macOS app provisioning profile does not include packet-tunnel-provider.");
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function plistStringArray(values) {
  return `<array>\n${values.map((value) => `    <string>${escapeXml(value)}</string>`).join("\n")}\n  </array>`;
}

function writeProfileEntitlements(profile) {
  mkdirSync(generatedEntitlementsDir, { recursive: true });
  const destination = resolve(generatedEntitlementsDir, "macos-app.plist");
  const keychainAccessGroups = profile.keychainAccessGroups.length
    ? profile.keychainAccessGroups
    : [`${profile.teamIdentifier}.*`];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.application-identifier</key>
  <string>${escapeXml(profile.applicationIdentifier)}</string>
  <key>com.apple.developer.networking.networkextension</key>
  ${plistStringArray(["packet-tunnel-provider"])}
  <key>com.apple.developer.team-identifier</key>
  <string>${escapeXml(profile.teamIdentifier)}</string>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.application-groups</key>
  ${plistStringArray(["group.app.voyavpn.desktop"])}
  <key>com.apple.security.network.client</key>
  <true/>
  <key>keychain-access-groups</key>
  ${plistStringArray(keychainAccessGroups)}
</dict>
</plist>
`;
  writeFileSync(destination, xml);
  return destination;
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("macOS app signing must run on macOS.");
  }
  if (!existsSync(appBundle)) {
    throw new Error(`macOS app bundle is missing: ${appBundle}`);
  }

  const identity = process.env.VOYAVPN_CODESIGN_IDENTITY;
  if (!identity) {
    throw new Error("VOYAVPN_CODESIGN_IDENTITY is required to sign the macOS app bundle.");
  }

  const distribution = distributionMode(identity);
  if (existsSync(legacyTunnelHelper) && !truthy(process.env.VOYAVPN_PRESERVE_MACOS_TUNNEL_HELPER)) {
    rmSync(legacyTunnelHelper, { force: true });
    console.log("Removed legacy macOS tunnel helper; NetworkExtension is controlled in-process by the app.");
  }
  const profile = provisioningProfile();
  const entitlements = profile ? writeProfileEntitlements(profile) : appEntitlements;
  if (profile) {
    validateProvisioningProfile(profile);
    cpSync(profile.path, appProvisioningProfileDestination);
    console.log(`Using macOS app provisioning profile ${profile.name || profile.path}`);
  } else if (distribution === "app-store" || truthy(process.env.VOYAVPN_REQUIRE_PROVISIONING)) {
    throw new Error(
      "macOS app provisioning profile was not found. Set VOYAVPN_MACOS_APP_PROVISIONING_PROFILE or VOYAVPN_PROVISIONING_PROFILE_DIR.",
    );
  }

  const args = ["--force", "--options", "runtime", "--sign", identity, "--entitlements", entitlements];
  if (!truthy(process.env.VOYAVPN_DISABLE_CODESIGN_TIMESTAMP)) {
    args.push("--timestamp");
  }
  args.push(appBundle);

  run("codesign", args);
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle]);
  if (distribution === "developer-id") {
    run("spctl", ["--assess", "--type", "execute", "--verbose=4", appBundle]);
  } else {
    const assessment = runAllowFailure("spctl", ["--assess", "--type", "execute", "--verbose=4", appBundle]);
    if (assessment.status === 0) {
      console.log("App Store/TestFlight app also passed local spctl assessment.");
    } else {
      console.warn("Skipping spctl failure for App Store/TestFlight distribution; Gatekeeper assessment applies to Developer ID notarized artifacts.");
    }
  }
  console.log(`macOS app bundle signed for ${distribution}: ${appBundle}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
