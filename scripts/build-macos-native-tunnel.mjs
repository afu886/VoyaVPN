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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { capture, requireDarwin, run, truthy } from "./lib/common.mjs";
import {
  appBundleIdentifier,
  incompatiblePacketTunnelBundle,
  packetTunnelBundleIdentifier,
  packetTunnelLayout,
  requiredNetworkExtensionValue,
  distributionFromIdentityName,
} from "./macos-native-tunnel-layout.mjs";
import {
  distributionProfileLabel,
  formatProfileSelectionError,
  localProvisioningUdid,
  profileRejectionReason,
  resolveProfileFromEnv,
  resolveSigningIdentity,
  writeProfileEntitlements,
} from "./macos-provisioning.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nativeRoot = resolve(repoRoot, "apps", "desktop", "src-tauri", "native", "macos");
const outRoot = resolve(repoRoot, "target", "native", "macos");
const appBundle = resolve(process.env.VOYAVPN_MACOS_APP_BUNDLE || resolve(outRoot, "VoyaVPN.app"));
const appContents = resolve(appBundle, "Contents");
const helperSource = resolve(nativeRoot, "TunnelHelper", "VoyaPacketTunnelManager.swift");
const providerSource = resolve(nativeRoot, "PacketTunnel", "PacketTunnelProvider.swift");
const helperOut = resolve(appContents, "MacOS", "voyavpn-macos-tunnelctl");
const resolvedIdentity = resolveIdentityFromEnv();
const macosDistribution = distributionFromIdentityName(
  resolvedIdentity?.name ?? "",
  process.env.VOYAVPN_MACOS_DISTRIBUTION,
);
const tunnelLayout = packetTunnelLayout(appContents, macosDistribution);
const incompatibleTunnelBundle = incompatiblePacketTunnelBundle(appContents, macosDistribution);
const appexContents = tunnelLayout.contents;
const appexBundle = tunnelLayout.bundle;
const appexBinary = tunnelLayout.binary;
const appexFrameworks = tunnelLayout.frameworks;
const appProvisioningProfileDestination = resolve(appContents, "embedded.provisionprofile");
const packetTunnelProvisioningProfileDestination = tunnelLayout.provisioningProfile;
const defaultLibboxXCFramework = resolve(nativeRoot, "Frameworks", "Libbox.xcframework");
const libboxXCFramework = resolve(process.env.VOYAVPN_LIBBOX_XCFRAMEWORK || defaultLibboxXCFramework);
const embeddedLibboxFramework = tunnelLayout.embeddedLibboxFramework;
const appEntitlements = resolve(repoRoot, "apps", "desktop", "src-tauri", "entitlements", "macos-app.plist");
const packetTunnelEntitlements = resolve(repoRoot, "apps", "desktop", "src-tauri", "entitlements", "packet-tunnel.plist");
const defaultProvisioningProfileDir = resolve(repoRoot, "..", "docs", "certs");
const provisioningProfileDir = resolve(process.env.VOYAVPN_PROVISIONING_PROFILE_DIR || defaultProvisioningProfileDir);
const generatedEntitlementsDir = resolve(outRoot, "generated-entitlements");

function resolveIdentityFromEnv() {
  const value = process.env.VOYAVPN_CODESIGN_IDENTITY?.trim();
  if (!value) {
    return null;
  }
  try {
    return resolveSigningIdentity(value);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function signingCriteria() {
  return {
    distribution: macosDistribution,
    allowDevelopmentProvisioning: truthy(process.env.VOYAVPN_ALLOW_DEVELOPMENT_PROVISIONING),
    identitySha1: resolvedIdentity?.sha1 ?? null,
    deviceUdid: resolvedIdentity ? localProvisioningUdid() : null,
  };
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

function findProvisioningProfile(bundleIdentifier, envName, criteria) {
  return resolveProfileFromEnv({
    bundleIdentifier,
    explicitEnvName: envName,
    profileDir: provisioningProfileDir,
    criteria,
  });
}

function requireProfileCapability(profile, label, capability, values) {
  for (const value of values) {
    if (!profile[capability].includes(value)) {
      throw new Error(`${label} provisioning profile ${profile.path} does not include ${value}.`);
    }
  }
}

function validateProvisioningProfile(profile, label, bundleIdentifier, criteria) {
  const reason = profileRejectionReason(profile, { ...criteria, bundleIdentifier });
  if (reason) {
    throw new Error(`${label} provisioning profile ${profile.path} cannot be used: ${reason}.`);
  }
  if (profile.teamIdentifier && !profile.applicationIdentifier.startsWith(`${profile.teamIdentifier}.`)) {
    throw new Error(`${label} provisioning profile application identifier does not match its team identifier.`);
  }
  requireProfileCapability(profile, label, "appGroups", ["group.app.voyavpn.desktop"]);
  requireProfileCapability(profile, label, "networkExtensions", [requiredNetworkExtensionValue(criteria.distribution)]);
}

function profileOrWarn(bundleIdentifier, envName, label, criteria) {
  const { profile, rejections } = findProvisioningProfile(bundleIdentifier, envName, criteria);
  if (!profile) {
    const message = `${formatProfileSelectionError(
      `${label} ${distributionProfileLabel(criteria.distribution)}`,
      bundleIdentifier,
      rejections,
      provisioningProfileDir,
    )}\nSet ${envName} to select a profile explicitly.`;
    if (truthy(process.env.VOYAVPN_REQUIRE_PROVISIONING) || process.env.VOYAVPN_CODESIGN_IDENTITY) {
      throw new Error(message);
    }
    console.warn(message);
    return null;
  }

  validateProvisioningProfile(profile, label, bundleIdentifier, criteria);
  console.log(`Using ${label} provisioning profile ${profile.name || profile.uuid || profile.path}`);
  return profile;
}

function entitlementsForSigning(baseEntitlements, profile, name) {
  if (!profile) {
    return baseEntitlements;
  }
  return writeProfileEntitlements(profile, resolve(generatedEntitlementsDir, name), baseEntitlements);
}

function stageProvisioningProfiles() {
  const criteria = signingCriteria();
  const appProfile = profileOrWarn(
    appBundleIdentifier,
    "VOYAVPN_MACOS_APP_PROVISIONING_PROFILE",
    "macOS app",
    criteria,
  );
  const packetTunnelProfile = profileOrWarn(
    packetTunnelBundleIdentifier,
    "VOYAVPN_PACKET_TUNNEL_PROVISIONING_PROFILE",
    "PacketTunnel",
    criteria,
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
  const result = capture("file", [binary], {
    cwd: repoRoot,
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
  ], { cwd: repoRoot });
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

  rmSync(incompatibleTunnelBundle, { force: true, recursive: true });
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
  run("xcrun", args, { cwd: repoRoot });
  removeSwiftModuleArtifacts(appexBinary);

  writePlist(
    resolve(nativeRoot, "PacketTunnel", "Info.plist"),
    resolve(appexContents, "Info.plist"),
    {
      "$(PRODUCT_MODULE_NAME)": "VoyaPacketTunnel",
      "$(EXECUTABLE_NAME)": "VoyaPacketTunnel",
      "$(MARKETING_VERSION)": "0.1.0",
      "$(CURRENT_PROJECT_VERSION)": "1",
      "$(BUNDLE_PACKAGE_TYPE)": tunnelLayout.infoPackageType,
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
  const identity = resolvedIdentity?.sha1;
  if (!identity) {
    console.warn("Skipping codesign: VOYAVPN_CODESIGN_IDENTITY is not set.");
    console.warn(`App entitlements: ${appEntitlements}`);
    console.warn(`PacketTunnel entitlements: ${packetTunnelEntitlements}`);
    return;
  }

  const codesignArgs = ["--force", "--options", "runtime", "--sign", identity];
  if (!truthy(process.env.VOYAVPN_DISABLE_CODESIGN_TIMESTAMP)) {
    codesignArgs.push("--timestamp");
  }

  if (existsSync(embeddedLibboxFramework)) {
    run("codesign", [...codesignArgs, embeddedLibboxFramework], { cwd: repoRoot });
  }

  const packetEntitlements = entitlementsForSigning(
    packetTunnelEntitlements,
    profiles.packetTunnel,
    "packet-tunnel.plist",
  );
  run("codesign", [...codesignArgs, "--entitlements", packetEntitlements, appexBundle], { cwd: repoRoot });
  if (existsSync(helperOut)) {
    const helperEntitlements = entitlementsForSigning(appEntitlements, profiles.app, "macos-helper.plist");
    run("codesign", [...codesignArgs, "--entitlements", helperEntitlements, helperOut], { cwd: repoRoot });
  }
}

function main() {
  requireDarwin("macOS native tunnel build must run on macOS with Xcode command line tools.");
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
  console.log(
    `macOS native tunnel staged for ${macosDistribution} as ${tunnelLayout.label}: ${appexBundle}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
