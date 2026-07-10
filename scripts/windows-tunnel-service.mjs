import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./lib/common.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] ?? "help";
const serviceName = "VoyaVPNTunnelService";
const serviceDisplayName = "VoyaVPN Tunnel Service";
const serviceBin = resolve(repoRoot, "target", "release", process.platform === "win32" ? "voyavpn-tunnel-service.exe" : "voyavpn-tunnel-service");

function requireWindows() {
  if (process.platform !== "win32") {
    throw new Error("Windows tunnel service install commands must run on Windows.");
  }
}

function build() {
  run("cargo", ["build", "-p", "voyavpn", "--bin", "voyavpn-tunnel-service", "--release"], {
    cwd: repoRoot,
    shell: false,
  });
}

function install() {
  requireWindows();
  if (!existsSync(serviceBin)) {
    build();
  }
  run("sc.exe", [
    "create",
    serviceName,
    `binPath=`,
    serviceBin,
    "start=",
    "demand",
    "DisplayName=",
    serviceDisplayName,
  ], { cwd: repoRoot, shell: false });
  run("sc.exe", ["description", serviceName, "Runs VoyaVPN transparent TUN with sing-box and Wintun."], {
    cwd: repoRoot,
    shell: false,
  });
}

function uninstall() {
  requireWindows();
  spawnSync("sc.exe", ["stop", serviceName], { cwd: repoRoot, stdio: "ignore" });
  run("sc.exe", ["delete", serviceName], { cwd: repoRoot, shell: false });
}

function status() {
  requireWindows();
  run("sc.exe", ["query", serviceName], { cwd: repoRoot, shell: false });
}

function help() {
  console.log("usage: node scripts/windows-tunnel-service.mjs <build|install|uninstall|status>");
}

try {
  switch (command) {
    case "build":
      build();
      break;
    case "install":
      install();
      break;
    case "uninstall":
      uninstall();
      break;
    case "status":
      status();
      break;
    case "help":
    case "--help":
    case "-h":
      help();
      break;
    default:
      throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
