import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

import { productionLineCount, splitRustProduction } from "./architecture-analyzer.mjs";

const root = resolve(import.meta.dirname, "../..");
const failures = [];

const rustFiles = ["crates", "apps/desktop/src-tauri/src"]
  .flatMap((directory) => walk(resolve(root, directory)))
  .filter((path) => path.endsWith(".rs"))
  .filter((path) => !path.includes("/migrations/"))
  .filter((path) => !path.endsWith("/tests.rs"))
  .filter((path) => !path.endsWith("/golden.rs"));

for (const path of rustFiles) {
  const source = readFileSync(path, "utf8");
  const { layoutError, production } = splitRustProduction(source);
  if (layoutError) {
    failures.push(`${display(path)}: ${layoutError}`);
  }
  const lineCount = productionLineCount(production);
  if (lineCount > 800) {
    failures.push(`${display(path)} has ${lineCount} production lines (maximum 800)`);
  }

  if (path.includes("/crates/voya-app/src/")) {
    reject(
      path,
      production,
      /\b(?:reqwest|tokio_tungstenite|tokio::net|tokio::fs|std::fs)\b/,
      "voya-app must use network and filesystem adapters",
    );
    reject(path, production, /\bspecta\b/, "voya-app must expose IPC through voya-contracts");
  }

  if (path.includes("/crates/voya-core/src/")) {
    reject(path, production, /#\[cfg\(target_os\b/, "voya-core must be OS independent");
    reject(path, production, /\bspecta\b/, "voya-core must not depend on IPC type generation");
  }

  if (path.includes("/apps/desktop/src-tauri/src/") && !path.includes("/src/bin/")) {
    reject(
      path,
      source,
      /#\[cfg\(test\)\]/,
      "tests belong in app/contracts/platform crates because the Tauri shell lib harness is disabled",
    );
    reject(
      path,
      production,
      /\bvoya_(?:core|db)::/,
      "the Tauri shell must reach domain and persistence through voya-app facades",
    );
    if (!path.endsWith("/ipc/events.rs")) {
      reject(
        path,
        production,
        /#\[derive\([^\]]*\bType\b/,
        "business and command DTOs belong in voya-contracts",
      );
    }
  }

  requireSafetyComments(path, production);

  if (!path.endsWith("/crates/voya-net/src/clash.rs")) {
    reject(path, production, /serde\([^\n]*\balias\s*=/, "serde aliases are retired outside the documented Clash API boundary");
    reject(
      path,
      production,
      /rename_all\s*=\s*"PascalCase"/,
      "v2rayN-style PascalCase serialization is retired outside the Clash API boundary",
    );
  }

  reject(path, production, /v2rayn:\/\//i, "the private v2rayn:// format is retired");
  reject(
    path,
    production,
    /\b(?:AppConfigStore|ProtocolExtraItem|TransportExtraItem|remove_retired_voya_config_fields|prev_profile|next_profile)\b/,
    "retired configuration compatibility code is forbidden",
  );
}

const shellManifestPath = resolve(root, "apps/desktop/src-tauri/Cargo.toml");
reject(
  shellManifestPath,
  readFileSync(shellManifestPath, "utf8"),
  /^voya-(?:core|db)(?:\.workspace)?\s*=/m,
  "the Tauri shell must not depend directly on voya-core or voya-db",
);

const appManifestPath = resolve(root, "crates/voya-app/Cargo.toml");
reject(
  appManifestPath,
  readFileSync(appManifestPath, "utf8"),
  /^specta(?:\.workspace)?\s*=/m,
  "voya-app must not depend on Specta",
);

for (const path of walk(resolve(root, "crates/voya-contracts/src")).filter((item) => item.endsWith(".rs"))) {
  reject(
    path,
    readFileSync(path, "utf8"),
    /rename_all\s*=\s*"PascalCase"/,
    "public contracts must use camelCase",
  );
}

if (failures.length > 0) {
  console.error("Architecture checks failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Architecture checks passed (${rustFiles.length} Rust production files).`);

function reject(path, source, pattern, message) {
  if (pattern.test(source)) failures.push(`${display(path)}: ${message}`);
}

function requireSafetyComments(path, source) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\bunsafe\s*(?:\{|impl\b)/.test(lines[index])) continue;
    const context = lines.slice(Math.max(0, index - 3), index).join("\n");
    if (!/SAFETY:/.test(context)) {
      failures.push(`${display(path)}:${index + 1}: unsafe code requires a nearby SAFETY comment`);
    }
  }
}

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function display(path) {
  return relative(root, path);
}
