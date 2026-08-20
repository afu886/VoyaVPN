import { describe, expect, it, vi } from "vitest";

import { prepareTauriInvocation } from "./cli.mjs";

describe("Tauri CLI", () => {
  it("defaults to dev and adds the generated core overlay", async () => {
    const invocation = await prepareTauriInvocation([], {
      repoRoot: "/repo",
      sourceEnv: {},
      ensureSeed: vi.fn(),
      writeCoreOverlay: () => "/repo/target/tauri-config/tauri.core-seeds.generated.json",
    });

    expect(invocation.commandArgs).toEqual([
      "dev",
      "--config",
      "/repo/target/tauri-config/tauri.core-seeds.generated.json",
    ]);
  });

  it("prepares build seeds and normalizes CI", async () => {
    const ensureSeed = vi.fn();
    const invocation = await prepareTauriInvocation(["build", "--debug"], {
      repoRoot: "/repo",
      sourceEnv: { CI: "1", VOYAVPN_TAURI_UPDATER_CONFIG: "false" },
      ensureSeed,
      writeCoreOverlay: () => null,
    });

    expect(ensureSeed).toHaveBeenCalledWith({ repoRoot: "/repo" });
    expect(invocation.commandArgs).toEqual(["build", "--debug"]);
    expect(invocation.env.CI).toBe("true");
  });

  it("adds stable updater and core overlays to build without changing signer passthrough", async () => {
    const sourceEnv = { CI: "0", VOYAVPN_RELEASE_CHANNEL: "stable" };
    const writeUpdaterOverlay = vi.fn(() => "/repo/target/release-config/tauri.updater.json");
    const invocation = await prepareTauriInvocation(["build", "--bundles", "app"], {
      repoRoot: "/repo",
      sourceEnv,
      ensureSeed: vi.fn(),
      writeCoreOverlay: () => "/repo/target/release-config/tauri.core.json",
      writeUpdaterOverlay,
    });

    expect(writeUpdaterOverlay).toHaveBeenCalledWith({
      repoRoot: "/repo",
      env: expect.objectContaining({ CI: "false" }),
    });
    expect(invocation.commandArgs).toEqual([
      "build",
      "--config",
      "/repo/target/release-config/tauri.updater.json",
      "--config",
      "/repo/target/release-config/tauri.core.json",
      "--bundles",
      "app",
    ]);
  });

  it("passes non-build commands through without build preparation", async () => {
    const ensureSeed = vi.fn();
    const invocation = await prepareTauriInvocation(["signer", "generate"], {
      repoRoot: "/repo",
      sourceEnv: {},
      ensureSeed,
      writeCoreOverlay: vi.fn(),
    });

    expect(ensureSeed).not.toHaveBeenCalled();
    expect(invocation.commandArgs).toEqual(["signer", "generate"]);
  });
});
