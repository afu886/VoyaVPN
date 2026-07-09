import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  appBundleIdentifier,
  packetTunnelBundleIdentifier,
  packetTunnelLayout,
  requiredNetworkExtensionValue,
  distributionFromIdentityName,
} from "./macos-native-tunnel-layout.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = resolve(repoRoot, "target", "native", "macos");
const appBundle = resolve(process.env.VOYAVPN_MACOS_APP_BUNDLE || resolve(repoRoot, "target", "native", "macos", "VoyaVPN.app"));
const appContents = resolve(appBundle, "Contents");
const appInfoPlist = resolve(appContents, "Info.plist");
const legacyTunnelHelper = resolve(appContents, "MacOS", "voyavpn-macos-tunnelctl");
const appProvisioningProfileDestination = resolve(appContents, "embedded.provisionprofile");
const appEntitlements = resolve(repoRoot, "apps", "desktop", "src-tauri", "entitlements", "macos-app.plist");
const packetTunnelEntitlements = resolve(repoRoot, "apps", "desktop", "src-tauri", "entitlements", "packet-tunnel.plist");
const defaultProvisioningProfileDir = resolve(repoRoot, "..", "docs", "certs");
const provisioningProfileDir = resolve(process.env.VOYAVPN_PROVISIONING_PROFILE_DIR || defaultProvisioningProfileDir);
const generatedEntitlementsDir = resolve(outRoot, "generated-entitlements");
let tunnelLayout;
let packetTunnelBundle;
let packetTunnelProvisioningProfileDestination;
let embeddedLibboxFramework;

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

function capture(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: repoRoot,
    encoding: "utf8",
    input: options.input,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
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
  return distributionFromIdentityName(signingIdentityName(identity), process.env.VOYAVPN_MACOS_DISTRIBUTION);
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

function plistBuddyXml(plistPath, keyPath, optional = false) {
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-x", "-c", `Print ${keyPath}`, plistPath], {
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

function developerCertificateSubjects(plistPath) {
  const subjects = [];
  for (let index = 0; ; index += 1) {
    const certificateXml = plistBuddyXml(plistPath, `:DeveloperCertificates:${index}`, true);
    if (!certificateXml) {
      break;
    }
    const dataMatch = certificateXml.match(/<data>\s*([\s\S]*?)\s*<\/data>/);
    if (!dataMatch) {
      continue;
    }
    const certificate = Buffer.from(dataMatch[1].replace(/\s+/g, ""), "base64");
    const subject = capture("openssl", ["x509", "-inform", "DER", "-noout", "-subject"], {
      input: certificate,
    }).trim();
    subjects.push(subject);
  }
  return subjects;
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
    appSandbox: plistBuddy(plistPath, ":Entitlements:com.apple.security.app-sandbox", true) === "true",
    developerCertificateSubjects: developerCertificateSubjects(plistPath),
    keychainAccessGroups: parsePlistArray(plistBuddy(plistPath, ":Entitlements:keychain-access-groups", true)),
    networkClient: plistBuddy(plistPath, ":Entitlements:com.apple.security.network.client", true) === "true",
    networkExtensions: parsePlistArray(
      plistBuddy(plistPath, ":Entitlements:com.apple.developer.networking.networkextension", true),
    ),
    systemExtensionInstall: plistBuddy(
      plistPath,
      ":Entitlements:com.apple.developer.system-extension.install",
      true,
    ) === "true",
  };
}

function profileMatchesDistribution(profile, distribution) {
  if (distribution === "developer-id") {
    return profile.developerCertificateSubjects.some((subject) => subject.includes("CN=Developer ID Application:"));
  }
  if (distribution === "app-store") {
    return profile.developerCertificateSubjects.some(
      (subject) =>
        subject.includes("CN=3rd Party Mac Developer Application:")
        || subject.includes("CN=Apple Distribution:")
        || (truthy(process.env.VOYAVPN_ALLOW_DEVELOPMENT_PROVISIONING)
          && (subject.includes("CN=Apple Development:") || subject.includes("CN=Mac Developer:"))),
    );
  }
  return true;
}

function distributionProfileLabel(distribution) {
  return distribution === "developer-id" ? "Developer ID" : "App Store/TestFlight";
}

function provisioningProfile(bundleIdentifier, explicitEnvName, distribution) {
  const explicit = process.env[explicitEnvName];
  if (explicit) {
    const profilePath = resolve(explicit);
    if (!existsSync(profilePath)) {
      throw new Error(`${explicitEnvName} points to a missing file: ${profilePath}`);
    }
    return decodeProvisioningProfile(profilePath);
  }

  for (const profilePath of collectProvisioningProfiles(provisioningProfileDir)) {
    const profile = decodeProvisioningProfile(profilePath);
    if (profile.bundleIdentifier === bundleIdentifier && profileMatchesDistribution(profile, distribution)) {
      return profile;
    }
  }

  return null;
}

function validateProvisioningProfile(profile, distribution, label, bundleIdentifier) {
  if (profile.bundleIdentifier !== bundleIdentifier) {
    throw new Error(`${label} provisioning profile bundle id mismatch: expected ${bundleIdentifier}, got ${profile.bundleIdentifier}.`);
  }
  if (!profileMatchesDistribution(profile, distribution)) {
    throw new Error(
      `${label} provisioning profile ${profile.path} is not a ${distributionProfileLabel(distribution)} profile.`,
    );
  }
  if (!profile.appGroups.includes("group.app.voyavpn.desktop")) {
    throw new Error(`${label} provisioning profile does not include group.app.voyavpn.desktop.`);
  }
  if (!profile.networkExtensions.includes("packet-tunnel-provider")) {
    const requiredValue = requiredNetworkExtensionValue(distribution);
    if (!profile.networkExtensions.includes(requiredValue)) {
      throw new Error(`${label} provisioning profile does not include ${requiredValue}.`);
    }
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

function baseEntitlementEnabled(baseEntitlements, keyPath) {
  return plistBuddy(baseEntitlements, keyPath, true) === "true";
}

function writeProfileEntitlements(profile, name, baseEntitlements) {
  mkdirSync(generatedEntitlementsDir, { recursive: true });
  const destination = resolve(generatedEntitlementsDir, name);
  const keychainAccessGroups = profile.keychainAccessGroups.length
    ? profile.keychainAccessGroups
    : [`${profile.teamIdentifier}.*`];
  const appGroups = profile.appGroups.length ? profile.appGroups : ["group.app.voyavpn.desktop"];
  const appSandbox = profile.appSandbox || baseEntitlementEnabled(baseEntitlements, ":com.apple.security.app-sandbox");
  const networkClient = profile.networkClient || baseEntitlementEnabled(baseEntitlements, ":com.apple.security.network.client");
  const systemExtensionInstall =
    profile.systemExtensionInstall ||
    baseEntitlementEnabled(baseEntitlements, ":com.apple.developer.system-extension.install");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.application-identifier</key>
  <string>${escapeXml(profile.applicationIdentifier)}</string>
  <key>com.apple.developer.networking.networkextension</key>
  ${plistStringArray(profile.networkExtensions)}
  ${systemExtensionInstall ? "<key>com.apple.developer.system-extension.install</key>\n  <true/>" : ""}
  <key>com.apple.developer.team-identifier</key>
  <string>${escapeXml(profile.teamIdentifier)}</string>
  ${appSandbox ? "<key>com.apple.security.app-sandbox</key>\n  <true/>" : ""}
  <key>com.apple.security.application-groups</key>
  ${plistStringArray(appGroups)}
  ${networkClient ? "<key>com.apple.security.network.client</key>\n  <true/>" : ""}
  <key>keychain-access-groups</key>
  ${plistStringArray(keychainAccessGroups)}
</dict>
</plist>
`;
  writeFileSync(destination, xml);
  return destination;
}

function codesignBaseArgs(identity) {
  const args = ["--force", "--options", "runtime", "--sign", identity];
  if (!truthy(process.env.VOYAVPN_DISABLE_CODESIGN_TIMESTAMP)) {
    args.push("--timestamp");
  }
  return args;
}

function signPlainExecutable(identity, path, label) {
  if (!existsSync(path)) {
    return;
  }
  run("codesign", [...codesignBaseArgs(identity), path]);
  console.log(`Signed nested executable: ${label}`);
}

function signNestedCode(identity, packetTunnelProfile) {
  if (existsSync(embeddedLibboxFramework)) {
    run("codesign", [...codesignBaseArgs(identity), embeddedLibboxFramework]);
    console.log("Signed nested framework: Libbox.framework");
  }

  if (existsSync(packetTunnelBundle)) {
    const entitlements = packetTunnelProfile
      ? writeProfileEntitlements(packetTunnelProfile, "packet-tunnel.plist", packetTunnelEntitlements)
      : packetTunnelEntitlements;
    run("codesign", [...codesignBaseArgs(identity), "--entitlements", entitlements, packetTunnelBundle]);
    console.log(`Signed nested ${tunnelLayout.label}: PacketTunnel`);
  }

  signPlainExecutable(identity, resolve(appContents, "MacOS", "voyavpn-tunnel-service"), "voyavpn-tunnel-service");
  signPlainExecutable(identity, resolve(appContents, "MacOS", "export-bindings"), "export-bindings");
  signPlainExecutable(identity, resolve(appContents, "Resources", "core-seeds", "sing_box", "sing-box"), "sing-box core seed");
}

function removeUnsupportedLaunchServicesKeys() {
  if (!existsSync(appInfoPlist)) {
    throw new Error(`macOS app Info.plist is missing: ${appInfoPlist}`);
  }

  const carbonRequirement = plistBuddy(appInfoPlist, ":LSRequiresCarbon", true);
  if (!carbonRequirement) {
    return;
  }

  run("/usr/libexec/PlistBuddy", ["-c", "Delete :LSRequiresCarbon", appInfoPlist]);
  console.log("Removed unsupported LSRequiresCarbon from macOS app Info.plist.");
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
  tunnelLayout = packetTunnelLayout(appContents, distribution);
  packetTunnelBundle = tunnelLayout.bundle;
  packetTunnelProvisioningProfileDestination = tunnelLayout.provisioningProfile;
  embeddedLibboxFramework = tunnelLayout.embeddedLibboxFramework;
  removeUnsupportedLaunchServicesKeys();
  if (existsSync(legacyTunnelHelper) && !truthy(process.env.VOYAVPN_PRESERVE_MACOS_TUNNEL_HELPER)) {
    rmSync(legacyTunnelHelper, { force: true });
    console.log("Removed legacy macOS tunnel helper; NetworkExtension is controlled in-process by the app.");
  }
  const appProfile = provisioningProfile(
    appBundleIdentifier,
    "VOYAVPN_MACOS_APP_PROVISIONING_PROFILE",
    distribution,
  );
  const packetTunnelProfile = existsSync(packetTunnelBundle)
    ? provisioningProfile(packetTunnelBundleIdentifier, "VOYAVPN_PACKET_TUNNEL_PROVISIONING_PROFILE", distribution)
    : null;
  const entitlements = appProfile
    ? writeProfileEntitlements(appProfile, "macos-app.plist", appEntitlements)
    : appEntitlements;
  if (appProfile) {
    validateProvisioningProfile(appProfile, distribution, "macOS app", appBundleIdentifier);
    cpSync(appProfile.path, appProvisioningProfileDestination);
    console.log(`Using macOS app provisioning profile ${appProfile.name || appProfile.path}`);
  } else if (distribution === "app-store" || distribution === "developer-id" || truthy(process.env.VOYAVPN_REQUIRE_PROVISIONING)) {
    throw new Error(
      `macOS app ${distributionProfileLabel(distribution)} provisioning profile was not found. Set VOYAVPN_MACOS_APP_PROVISIONING_PROFILE or VOYAVPN_PROVISIONING_PROFILE_DIR.`,
    );
  }
  if (packetTunnelProfile) {
    validateProvisioningProfile(packetTunnelProfile, distribution, "PacketTunnel", packetTunnelBundleIdentifier);
    mkdirSync(dirname(packetTunnelProvisioningProfileDestination), { recursive: true });
    cpSync(packetTunnelProfile.path, packetTunnelProvisioningProfileDestination);
    console.log(`Using PacketTunnel provisioning profile ${packetTunnelProfile.name || packetTunnelProfile.path}`);
  } else if (existsSync(packetTunnelBundle) && truthy(process.env.VOYAVPN_REQUIRE_PROVISIONING)) {
    throw new Error(
      `PacketTunnel ${distributionProfileLabel(distribution)} provisioning profile was not found. Set VOYAVPN_PACKET_TUNNEL_PROVISIONING_PROFILE or VOYAVPN_PROVISIONING_PROFILE_DIR.`,
    );
  }

  signNestedCode(identity, packetTunnelProfile);

  const args = [...codesignBaseArgs(identity), "--entitlements", entitlements];
  args.push(appBundle);

  run("codesign", args);
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appBundle]);
  if (distribution === "developer-id") {
    const assessment = runAllowFailure("spctl", ["--assess", "--type", "execute", "--verbose=4", appBundle]);
    if (assessment.status === 0) {
      console.log("Developer ID app passed local spctl assessment.");
    } else if (truthy(process.env.VOYAVPN_REQUIRE_GATEKEEPER_ASSESSMENT)) {
      throw new Error(`spctl assessment failed for Developer ID app: ${assessment.stderr || assessment.stdout}`);
    } else {
      console.warn(
        "Skipping spctl failure for Developer ID signing because Gatekeeper assessment is expected to pass after notarization and stapling.",
      );
    }
  } else {
    const assessment = runAllowFailure("spctl", ["--assess", "--type", "execute", "--verbose=4", appBundle]);
    if (assessment.status === 0) {
      console.log("App Store/TestFlight app also passed local spctl assessment.");
    } else {
      console.warn(
        "Skipping spctl failure for App Store/TestFlight distribution; this artifact is intended for App Store Connect/TestFlight, not direct drag-to-Applications launch.",
      );
      console.warn(
        "For direct macOS distribution, sign with a Developer ID Application identity and run pnpm native:macos:app:notarize.",
      );
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
