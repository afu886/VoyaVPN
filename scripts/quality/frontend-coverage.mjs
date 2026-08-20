import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const summaryPath = resolve(root, "coverage/coverage-summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
const minimum = 80;
const targetFiles = [
  "apps/desktop/src/ipc/commands.ts",
  "apps/desktop/src/features/settings/use-app-settings.ts",
  "apps/desktop/src/features/dns/use-dns-settings.ts",
  "apps/desktop/src/features/profiles/profile-form-schema.ts",
  "apps/desktop/src/features/routing/routing-form-schema.ts",
  "apps/desktop/src/features/routing/routing-form-values.ts",
  "apps/desktop/src/features/routing/use-routing-screen.ts",
  "apps/desktop/src/features/routing/routing-profile-dialog.tsx",
  "apps/desktop/src/features/routing/routing-rule-dialog.tsx",
];
const failures = [];

for (const relativePath of targetFiles) {
  const path = resolve(root, relativePath);
  const coverage = summary[path];
  if (!coverage) {
    failures.push(`${relativePath}: missing from the coverage report`);
    continue;
  }

  for (const metric of ["lines", "functions", "branches", "statements"]) {
    const actual = coverage[metric]?.pct;
    if (typeof actual !== "number" || actual < minimum) {
      failures.push(`${relativePath}: ${metric} ${actual ?? "missing"}% < ${minimum}%`);
    }
  }
}

if (failures.length > 0) {
  console.error("Critical frontend module coverage failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Critical frontend module coverage passed (${targetFiles.length} files, all metrics >= ${minimum}%).`);
