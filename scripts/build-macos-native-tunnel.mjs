import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = resolve(repoRoot, "src-tauri", "native", "macos");
const outRoot = resolve(repoRoot, "target", "native", "macos");
const appBundle = resolve(process.env.VOYAVPN_MACOS_APP_BUNDLE || resolve(outRoot, "VoyaVPN.app"));
const appContents = resolve(appBundle, "Contents");
const appBundleIdentifier = "app.voyavpn.desktop";
const packetTunnelBundleIdentifier = "app.voyavpn.desktop.PacketTunnel";
const helperSource = resolve(nativeRoot, "TunnelHelper", "VoyaPacketTunnelManager.swift");
const providerSource = resolve(nativeRoot, "PacketTunnel", "PacketTunnelProvider.swift");
const helperOut = resolve(appContents, "MacOS", "voyavpn-macos-tunnelctl");
const appexContents = resolve(appContents, "PlugIns", "app.voyavpn.desktop.PacketTunnel.appex", "Contents");
const appexBundle = resolve(appexContents, "..");
const appexBinary = resolve(appexContents, "MacOS", "VoyaPacketTunnel");
const appexFrameworks = resolve(appexContents, "Frameworks");
const appProvisioningProfileDestination = resolve(appContents, "embedded.provisionprofile");
const packetTunnelProvisioningProfileDestination = resolve(appexContents, "embedded.provisionprofile");
const defaultLibboxXCFramework = resolve(nativeRoot, "Frameworks", "Libbox.xcframework");
const libboxXCFramework = resolve(process.env.VOYAVPN_LIBBOX_XCFRAMEWORK || defaultLibboxXCFramework);
const embeddedLibboxFramework = resolve(appexFrameworks, "Libbox.framework");
const appEntitlements = resolve(repoRoot, "src-tauri", "entitlements", "macos-app.plist");
const packetTunnelEntitlements = resolve(repoRoot, "src-tauri", "entitlements", "packet-tunnel.plist");
const defaultProvisioningProfileDir = resolve(repoRoot, "..", "docs", "certs");
const provisioningProfileDir = resolve(process.env.VOYAVPN_PROVISIONING_PROFILE_DIR || defaultProvisioningProfileDir);
const generatedEntitlementsDir = resolve(outRoot, "generated-entitlements");

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

function capture(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd ?? repoRoot,
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

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function requireDarwin() {
  if (process.platform !== "darwin") {
    throw new Error("macOS native tunnel build must run on macOS with Xcode command line tools.");
  }
}

function writePlist(source, destination, replacements = {}) {
  let text = readFileSync(source, "utf8");
  for (const [from, to] of Object.entries(replacements)) {
    text = text.replaceAll(from, to);
  }
  writeFileSync(destination, text);
}

function collectDirectories(root, predicate, results = []) {
  if (!existsSync(root)) {
    return results;
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (!entry.isDirectory()) {
      continue;
    }
    if (predicate(path, entry.name)) {
      results.push(path);
      continue;
    }
    collectDirectories(path, predicate, results);
  }

  return results;
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
    uuid: plistBuddy(plistPath, ":UUID", true),
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

function resolveExplicitProfile(envName) {
  const value = process.env[envName];
  if (!value) {
    return null;
  }
  const profilePath = resolve(value);
  if (!existsSync(profilePath)) {
    throw new Error(`${envName} points to a missing provisioning profile: ${profilePath}`);
  }
  return decodeProvisioningProfile(profilePath);
}

function findProvisioningProfile(bundleIdentifier, envName) {
  const explicitProfile = resolveExplicitProfile(envName);
  if (explicitProfile) {
    return explicitProfile;
  }

  for (const profilePath of collectProvisioningProfiles(provisioningProfileDir)) {
    const profile = decodeProvisioningProfile(profilePath);
    if (profile.bundleIdentifier === bundleIdentifier) {
      return profile;
    }
  }

  return null;
}

function requireProfileCapability(profile, label, capability, values) {
  for (const value of values) {
    if (!profile[capability].includes(value)) {
      throw new Error(`${label} provisioning profile ${profile.path} does not include ${value}.`);
    }
  }
}

function validateProvisioningProfile(profile, label, bundleIdentifier) {
  if (profile.bundleIdentifier !== bundleIdentifier) {
    throw new Error(
      `${label} provisioning profile bundle id mismatch: expected ${bundleIdentifier}, got ${profile.bundleIdentifier}.`,
    );
  }
  if (profile.teamIdentifier && !profile.applicationIdentifier.startsWith(`${profile.teamIdentifier}.`)) {
    throw new Error(`${label} provisioning profile application identifier does not match its team identifier.`);
  }
  requireProfileCapability(profile, label, "appGroups", ["group.app.voyavpn.desktop"]);
  requireProfileCapability(profile, label, "networkExtensions", ["packet-tunnel-provider"]);
}

function profileOrWarn(bundleIdentifier, envName, label) {
  const profile = findProvisioningProfile(bundleIdentifier, envName);
  if (!profile) {
    const message = `${label} provisioning profile was not found. Set ${envName} or VOYAVPN_PROVISIONING_PROFILE_DIR.`;
    if (truthy(process.env.VOYAVPN_REQUIRE_PROVISIONING)) {
      throw new Error(message);
    }
    console.warn(message);
    return null;
  }

  validateProvisioningProfile(profile, label, bundleIdentifier);
  console.log(`Using ${label} provisioning profile ${profile.name || profile.uuid || profile.path}`);
  return profile;
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

function writeProfileEntitlements(profile, destination) {
  mkdirSync(dirname(destination), { recursive: true });
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

function entitlementsForSigning(baseEntitlements, profile, name) {
  if (!profile) {
    return baseEntitlements;
  }
  return writeProfileEntitlements(profile, resolve(generatedEntitlementsDir, name));
}

function stageProvisioningProfiles() {
  const appProfile = profileOrWarn(
    appBundleIdentifier,
    "VOYAVPN_MACOS_APP_PROVISIONING_PROFILE",
    "macOS app",
  );
  const packetTunnelProfile = profileOrWarn(
    packetTunnelBundleIdentifier,
    "VOYAVPN_PACKET_TUNNEL_PROVISIONING_PROFILE",
    "PacketTunnel",
  );

  if (appProfile) {
    mkdirSync(appContents, { recursive: true });
    cpSync(appProfile.path, appProvisioningProfileDestination);
  }
  if (packetTunnelProfile) {
    mkdirSync(appexContents, { recursive: true });
    cpSync(packetTunnelProfile.path, packetTunnelProvisioningProfileDestination);
  }

  return { app: appProfile, packetTunnel: packetTunnelProfile };
}

function libboxPreferenceScore(path) {
  const normalized = path.toLowerCase();
  let score = 0;
  if (normalized.includes("macos")) {
    score += 100;
  }
  if (normalized.includes("arm64_x86_64") || normalized.includes("x86_64_arm64")) {
    score += 20;
  }
  if (normalized.includes(process.arch === "arm64" ? "arm64" : "x86_64")) {
    score += 10;
  }
  if (normalized.includes("ios")) {
    score -= 100;
  }
  return score;
}

function findLibboxFramework() {
  if (!existsSync(libboxXCFramework)) {
    return null;
  }
  if (!statSync(libboxXCFramework).isDirectory()) {
    throw new Error(`VOYAVPN_LIBBOX_XCFRAMEWORK is not a directory: ${libboxXCFramework}`);
  }

  const frameworks = collectDirectories(libboxXCFramework, (_path, name) => name === "Libbox.framework");
  if (!frameworks.length) {
    throw new Error(`Libbox.framework was not found inside ${libboxXCFramework}`);
  }

  frameworks.sort((left, right) => libboxPreferenceScore(right) - libboxPreferenceScore(left));
  return frameworks[0];
}

function libboxBinaryPath(frameworkPath) {
  const direct = join(frameworkPath, "Libbox");
  if (existsSync(direct)) {
    return direct;
  }
  return join(frameworkPath, "Versions", "A", "Libbox");
}

function libboxFrameworkLinkage(frameworkPath) {
  const binary = libboxBinaryPath(frameworkPath);
  const result = spawnSync("file", [binary], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`file ${binary} failed with status ${result.status}`);
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (output.includes("current ar archive")) {
    return "static";
  }
  if (output.includes("dynamically linked shared library")) {
    return "dynamic";
  }
  return "unknown";
}

function buildHelper() {
  mkdirSync(dirname(helperOut), { recursive: true });
  run("xcrun", [
    "swiftc",
    "-O",
    "-parse-as-library",
    "-framework",
    "Foundation",
    "-framework",
    "NetworkExtension",
    helperSource,
    "-o",
    helperOut,
  ]);
}

function stageOptionalHelper() {
  rmSync(helperOut, { force: true });
  removeSwiftModuleArtifacts(helperOut);
  if (!truthy(process.env.VOYAVPN_BUILD_MACOS_TUNNEL_HELPER)) {
    console.log("Skipping optional macOS tunnel helper; the app controls NetworkExtension in-process.");
    return;
  }
  buildHelper();
  removeSwiftModuleArtifacts(helperOut);
  console.warn(
    "Built optional macOS tunnel helper for development only. App Store/TestFlight builds should use the in-process NetworkExtension controller.",
  );
}

function removeSwiftModuleArtifacts(binaryPath) {
  for (const extension of [".abi.json", ".swiftdoc", ".swiftmodule", ".swiftsourceinfo"]) {
    const artifact = `${binaryPath}${extension}`;
    if (existsSync(artifact)) {
      unlinkSync(artifact);
    }
  }
}

function removeDirectoryIfEmpty(path) {
  if (!existsSync(path)) {
    return;
  }
  if (readdirSync(path).length !== 0) {
    return;
  }
  rmdirSync(path);
}

function buildPacketTunnel() {
  const libboxFramework = findLibboxFramework();
  if (!libboxFramework) {
    const message = `Libbox.xcframework not found at ${libboxXCFramework}; PacketTunnel will build but fail closed until the framework is provided.`;
    if (truthy(process.env.VOYAVPN_REQUIRE_LIBBOX)) {
      throw new Error(message);
    }
    console.warn(message);
  }

  mkdirSync(dirname(appexBinary), { recursive: true });
  const args = [
    "swiftc",
    "-O",
    "-emit-executable",
    "-parse-as-library",
    "-module-name",
    "VoyaPacketTunnel",
    "-framework",
    "Foundation",
    "-framework",
    "NetworkExtension",
    "-framework",
    "Network",
    "-framework",
    "AppKit",
    "-framework",
    "CoreText",
    "-framework",
    "SystemConfiguration",
    "-framework",
    "UniformTypeIdentifiers",
    "-lresolv",
    "-lbsm",
    "-Xlinker",
    "-e",
    "-Xlinker",
    "_NSExtensionMain",
  ];

  if (libboxFramework) {
    args.push(
      "-F",
      dirname(libboxFramework),
      "-framework",
      "Libbox",
      "-Xlinker",
      "-rpath",
      "-Xlinker",
      "@executable_path/../Frameworks",
    );
  }

  args.push(providerSource, "-o", appexBinary);
  run("xcrun", args);
  removeSwiftModuleArtifacts(appexBinary);

  writePlist(
    resolve(nativeRoot, "PacketTunnel", "Info.plist"),
    resolve(appexContents, "Info.plist"),
    {
      "$(PRODUCT_MODULE_NAME)": "VoyaPacketTunnel",
      "$(EXECUTABLE_NAME)": "VoyaPacketTunnel",
      "$(MARKETING_VERSION)": "0.1.0",
      "$(CURRENT_PROJECT_VERSION)": "1",
    },
  );

  rmSync(embeddedLibboxFramework, { force: true, recursive: true });
  if (libboxFramework) {
    const linkage = libboxFrameworkLinkage(libboxFramework);
    if (linkage === "static") {
      removeDirectoryIfEmpty(appexFrameworks);
      console.log(`Linked static Libbox.framework from ${libboxFramework}; no framework embedding is required.`);
      return;
    }

    rmSync(embeddedLibboxFramework, { force: true, recursive: true });
    mkdirSync(appexFrameworks, { recursive: true });
    cpSync(libboxFramework, embeddedLibboxFramework, {
      dereference: false,
      force: true,
      recursive: true,
      verbatimSymlinks: true,
    });
    console.log(`Embedded ${linkage} Libbox.framework from ${libboxFramework}`);
  }
}

function maybeCodesign(profiles) {
  const identity = process.env.VOYAVPN_CODESIGN_IDENTITY;
  if (!identity) {
    console.warn("Skipping codesign: VOYAVPN_CODESIGN_IDENTITY is not set.");
    console.warn(`App entitlements: ${appEntitlements}`);
    console.warn(`PacketTunnel entitlements: ${packetTunnelEntitlements}`);
    return;
  }

  if (existsSync(embeddedLibboxFramework)) {
    run("codesign", ["--force", "--sign", identity, embeddedLibboxFramework]);
  }

  const packetEntitlements = entitlementsForSigning(
    packetTunnelEntitlements,
    profiles.packetTunnel,
    "packet-tunnel.plist",
  );
  run("codesign", ["--force", "--sign", identity, "--entitlements", packetEntitlements, appexBundle]);
  if (existsSync(helperOut)) {
    const helperEntitlements = entitlementsForSigning(appEntitlements, profiles.app, "macos-helper.plist");
    run("codesign", ["--force", "--sign", identity, "--entitlements", helperEntitlements, helperOut]);
  }
}

function main() {
  requireDarwin();
  if (!existsSync(providerSource)) {
    throw new Error("macOS PacketTunnel source is missing.");
  }
  if (truthy(process.env.VOYAVPN_BUILD_MACOS_TUNNEL_HELPER) && !existsSync(helperSource)) {
    throw new Error("macOS tunnel helper source is missing.");
  }
  stageOptionalHelper();
  buildPacketTunnel();
  const profiles = stageProvisioningProfiles();
  maybeCodesign(profiles);
  console.log(`macOS native tunnel staged in ${appBundle}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
