import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appBundle = resolve(
  process.env.VOYAVPN_MACOS_APP_BUNDLE || resolve(repoRoot, "target", "native", "macos", "VoyaVPN.app"),
);
const appContents = resolve(appBundle, "Contents");
const appBundleIdentifier = "app.voyavpn.desktop";
const packetTunnelBundleIdentifier = "app.voyavpn.desktop.PacketTunnel";
const helper = resolve(appContents, "MacOS", "voyavpn-macos-tunnelctl");
const appex = resolve(appContents, "PlugIns", "app.voyavpn.desktop.PacketTunnel.appex");
const appexContents = resolve(appex, "Contents");
const appexBinary = resolve(appexContents, "MacOS", "VoyaPacketTunnel");
const appProvisioningProfile = resolve(appContents, "embedded.provisionprofile");
const packetTunnelProvisioningProfile = resolve(appexContents, "embedded.provisionprofile");
const libbox = resolve(appexContents, "Frameworks", "Libbox.framework");
const libboxSymbols = ["_LibboxVersion", "_LibboxSetup", "_LibboxNewCommandServer", "_LibboxGetTunnelFileDescriptor"];

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function run(program, args) {
  return spawnSync(program, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function capture(program, args) {
  const result = run(program, args);
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function requireDarwin() {
  if (process.platform !== "darwin") {
    throw new Error("macOS native tunnel verification must run on macOS.");
  }
}

function requirePath(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} is missing: ${path}`);
  }
  console.log(`✓ ${label}: ${path}`);
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

function decodeProvisioningProfile(profilePath) {
  const decoded = capture("security", ["cms", "-D", "-i", profilePath]);
  const decodedDir = resolve(repoRoot, "target", "native", "macos", "verify-provisioning-profiles");
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
    name: plistBuddy(plistPath, ":Name", true),
    uuid: plistBuddy(plistPath, ":UUID", true),
    applicationIdentifier,
    bundleIdentifier,
    teamIdentifier,
    appGroups: parsePlistArray(plistBuddy(plistPath, ":Entitlements:com.apple.security.application-groups", true)),
    networkExtensions: parsePlistArray(
      plistBuddy(plistPath, ":Entitlements:com.apple.developer.networking.networkextension", true),
    ),
  };
}

function verifyProvisioningProfile(path, label, bundleIdentifier) {
  if (!existsSync(path)) {
    const message = `${label} provisioning profile is missing: ${path}`;
    if (truthy(process.env.VOYAVPN_REQUIRE_PROVISIONING)) {
      throw new Error(message);
    }
    console.warn(`! ${message}`);
    return null;
  }

  const profile = decodeProvisioningProfile(path);
  if (profile.bundleIdentifier !== bundleIdentifier) {
    throw new Error(`${label} provisioning profile bundle id mismatch: expected ${bundleIdentifier}, got ${profile.bundleIdentifier}.`);
  }
  if (!profile.appGroups.includes("group.app.voyavpn.desktop")) {
    throw new Error(`${label} provisioning profile does not include group.app.voyavpn.desktop.`);
  }
  if (!profile.networkExtensions.includes("packet-tunnel-provider")) {
    throw new Error(`${label} provisioning profile does not include packet-tunnel-provider.`);
  }

  console.log(`✓ ${label} provisioning profile: ${profile.name || profile.uuid || path}`);
  console.log(`✓ ${label} provisioning profile app id: ${profile.applicationIdentifier}`);
  return profile;
}

function verifySignature(path, label, requiredEntitlements = []) {
  const verify = run("codesign", ["--verify", "--strict", "--verbose=2", path]);
  if (verify.status !== 0) {
    const message = `${label} is not signed or failed signature verification.`;
    if (truthy(process.env.VOYAVPN_REQUIRE_CODESIGN)) {
      throw new Error(`${message}\n${verify.stderr || verify.stdout}`);
    }
    console.warn(`! ${message}`);
    return "";
  }

  console.log(`✓ ${label} signature is valid`);

  if (!requiredEntitlements.length) {
    return "";
  }

  const entitlements = run("codesign", ["-d", "--entitlements", ":-", path]);
  const output = `${entitlements.stdout ?? ""}\n${entitlements.stderr ?? ""}`;
  for (const entitlement of requiredEntitlements) {
    if (!output.includes(entitlement)) {
      const message = `${label} signature does not include ${entitlement}.`;
      if (truthy(process.env.VOYAVPN_REQUIRE_CODESIGN)) {
        throw new Error(message);
      }
      console.warn(`! ${message}`);
    } else {
      console.log(`✓ ${label} entitlement includes ${entitlement}`);
    }
  }
  return output;
}

function verifyLibboxRuntime() {
  const nm = run("nm", ["-gU", appexBinary]);
  const symbols = `${nm.stdout ?? ""}\n${nm.stderr ?? ""}`;
  const hasStaticLibbox = nm.status === 0 && libboxSymbols.every((symbol) => symbols.includes(symbol));
  if (hasStaticLibbox) {
    console.log("✓ Static Libbox symbols are linked into PacketTunnel binary");
    return;
  }

  if (existsSync(libbox)) {
    console.log(`✓ Embedded Libbox.framework: ${libbox}`);
    verifySignature(libbox, "Libbox.framework");
    return;
  }

  const message = `Libbox runtime is missing: no static symbols in ${appexBinary} and no embedded framework at ${libbox}`;
  if (truthy(process.env.VOYAVPN_REQUIRE_LIBBOX)) {
    throw new Error(message);
  }
  console.warn(`! ${message}`);
}

function main() {
  requireDarwin();
  requirePath(appBundle, "macOS app bundle");
  requirePath(appex, "PacketTunnel appex");
  requirePath(appexBinary, "PacketTunnel binary");
  verifyLibboxRuntime();

  const appProfile = verifyProvisioningProfile(appProvisioningProfile, "macOS app", appBundleIdentifier);
  const packetTunnelProfile = verifyProvisioningProfile(
    packetTunnelProvisioningProfile,
    "PacketTunnel",
    packetTunnelBundleIdentifier,
  );

  verifySignature(appBundle, "macOS app bundle", [
    "com.apple.developer.networking.networkextension",
    "packet-tunnel-provider",
    "com.apple.security.application-groups",
    "group.app.voyavpn.desktop",
    ...(appProfile ? [
      "com.apple.application-identifier",
      appProfile.applicationIdentifier,
      "com.apple.developer.team-identifier",
      appProfile.teamIdentifier,
    ] : []),
  ]);
  if (existsSync(helper)) {
    verifySignature(helper, "Optional tunnel helper");
  } else {
    console.log("✓ Optional tunnel helper is not bundled; NetworkExtension is controlled in-process by the app");
  }
  verifySignature(appex, "PacketTunnel appex", [
    "com.apple.developer.networking.networkextension",
    "packet-tunnel-provider",
    "com.apple.security.application-groups",
    "group.app.voyavpn.desktop",
    ...(packetTunnelProfile ? [
      "com.apple.application-identifier",
      packetTunnelProfile.applicationIdentifier,
      "com.apple.developer.team-identifier",
      packetTunnelProfile.teamIdentifier,
    ] : []),
  ]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
