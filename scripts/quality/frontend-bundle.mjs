import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { repoRootFromScript } from "../lib/common.mjs";

const assetsDir = join(repoRootFromScript(import.meta.url), "apps", "desktop", "dist", "assets");
const assets = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js"))
  .map((name) => ({ bytes: statSync(join(assetsDir, name)).size, name }));

const budgets = [
  { label: "application entry", maxKiB: 500, prefix: "index-" },
  { label: "profiles screen", maxKiB: 100, prefix: "server-table-" },
  { label: "QR decoder", maxKiB: 500, prefix: "vendor-qr-" },
];

for (const budget of budgets) {
  const asset = assets.find(({ name }) => name.startsWith(budget.prefix));
  if (!asset) {
    throw new Error(`${budget.label} bundle (${budget.prefix}*.js) was not generated`);
  }

  const sizeKiB = asset.bytes / 1024;
  if (sizeKiB > budget.maxKiB) {
    throw new Error(
      `${budget.label} bundle is ${sizeKiB.toFixed(1)} KiB; budget is ${budget.maxKiB} KiB`,
    );
  }
  console.log(`✓ ${budget.label}: ${sizeKiB.toFixed(1)} KiB / ${budget.maxKiB} KiB`);
}
