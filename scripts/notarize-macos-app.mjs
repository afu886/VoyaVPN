import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appBundle = resolve(process.env.VOYAVPN_MACOS_APP_BUNDLE || resolve(repoRoot, "target", "native", "macos", "VoyaVPN.app"));
const artifact = process.env.VOYAVPN_NOTARY_ARTIFACT ? resolve(process.env.VOYAVPN_NOTARY_ARTIFACT) : null;
const notaryZip = resolve(repoRoot, "target", "native", "macos", "VoyaVPN-notary.zip");

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd ?? repoRoot,
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
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${program} ${args.join(" ")} failed with status ${result.status}: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

function distributionMode() {
  const normalized = String(process.env.VOYAVPN_MACOS_DISTRIBUTION ?? "developer-id").trim().toLowerCase();
  if (["app-store", "appstore", "testflight", "mas"].includes(normalized)) {
    return "app-store";
  }
  if (!normalized || ["developer-id", "developerid", "notarized", "dmg", "auto"].includes(normalized)) {
    return "developer-id";
  }
  throw new Error("VOYAVPN_MACOS_DISTRIBUTION must be developer-id, app-store, or auto.");
}

function notaryCredentials() {
  if (process.env.VOYAVPN_NOTARY_KEYCHAIN_PROFILE) {
    const args = ["--keychain-profile", process.env.VOYAVPN_NOTARY_KEYCHAIN_PROFILE];
    if (process.env.VOYAVPN_NOTARY_KEYCHAIN) {
      args.push("--keychain", process.env.VOYAVPN_NOTARY_KEYCHAIN);
    }
    return args;
  }

  const appleId = process.env.VOYAVPN_NOTARY_APPLE_ID;
  const teamId = process.env.VOYAVPN_NOTARY_TEAM_ID;
  const password = process.env.VOYAVPN_NOTARY_PASSWORD;
  if (appleId && teamId && password) {
    return ["--apple-id", appleId, "--team-id", teamId, "--password", password];
  }

  throw new Error(
    "notary credentials are required: set VOYAVPN_NOTARY_KEYCHAIN_PROFILE, or VOYAVPN_NOTARY_APPLE_ID/TEAM_ID/PASSWORD.",
  );
}

function prepareArtifact() {
  if (artifact) {
    if (!existsSync(artifact)) {
      throw new Error(`notary artifact is missing: ${artifact}`);
    }
    return artifact;
  }

  if (!existsSync(appBundle)) {
    throw new Error(`macOS app bundle is missing: ${appBundle}`);
  }

  mkdirSync(dirname(notaryZip), { recursive: true });
  rmSync(notaryZip, { force: true });
  run("ditto", ["-c", "-k", "--keepParent", appBundle, notaryZip], { cwd: dirname(appBundle) });
  return notaryZip;
}

function stapleTarget(submittedArtifact) {
  const extension = extname(submittedArtifact).toLowerCase();
  if (extension === ".dmg" || extension === ".pkg") {
    return submittedArtifact;
  }
  return appBundle;
}

function submitForNotarization(submittedArtifact) {
  const credentials = notaryCredentials();
  const output = capture("xcrun", [
    "notarytool",
    "submit",
    submittedArtifact,
    "--wait",
    "--output-format",
    "json",
    ...credentials,
  ]);
  const result = JSON.parse(output);
  const id = result.id || result.jobId;
  if (result.status !== "Accepted") {
    if (id) {
      const log = capture("xcrun", ["notarytool", "log", id, "--output-format", "json", ...credentials]);
      console.error(log);
    }
    throw new Error(`notarization failed for ${submittedArtifact}: ${result.status || "unknown status"}`);
  }
  console.log(`macOS notarization accepted: ${id || submittedArtifact}`);
}

function main() {
  if (process.platform !== "darwin") {
    throw new Error("macOS notarization must run on macOS.");
  }
  if (distributionMode() === "app-store") {
    throw new Error("App Store/TestFlight builds are submitted through App Store Connect and are not notarized with notarytool.");
  }

  const submittedArtifact = prepareArtifact();
  submitForNotarization(submittedArtifact);

  const target = stapleTarget(submittedArtifact);
  run("xcrun", ["stapler", "staple", target]);
  run("xcrun", ["stapler", "validate", target]);
  console.log(`macOS notarization completed for ${target}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
