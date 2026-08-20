import { join } from "node:path";

import { repoRootFromScript, run } from "../lib/common.mjs";
import {
  ensureSingBoxSeedForBuild,
  singBoxExecutableName,
} from "../core/sing-box-installer.mjs";

const repoRoot = repoRootFromScript(import.meta.url);
const { seedDir } = await ensureSingBoxSeedForBuild({ repoRoot });
const executable = join(seedDir, singBoxExecutableName());

run(
  "cargo",
  ["test", "-p", "voya-core", "golden_core_acceptance_checks_are_opt_in", "--", "--nocapture"],
  {
    env: {
      ...process.env,
      VOYA_GOLDEN_ACCEPTANCE: "1",
      VOYA_SINGBOX_BIN: executable,
    },
    stdio: "inherit",
  },
);
