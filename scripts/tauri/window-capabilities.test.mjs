import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const capability = JSON.parse(
  readFileSync(
    new URL("../../apps/desktop/src-tauri/capabilities/default.json", import.meta.url),
    "utf8",
  ),
);

describe("desktop window capabilities", () => {
  it("lets the settings close listener finish Tauri's close lifecycle", () => {
    expect(capability.windows).toContain("settings");
    expect(capability.permissions).toEqual(
      expect.arrayContaining([
        "core:window:allow-close",
        "core:window:allow-destroy",
      ]),
    );
  });
});
