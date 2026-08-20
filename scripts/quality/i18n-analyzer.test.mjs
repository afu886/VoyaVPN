import { describe, expect, it } from "vitest";

import { inspectI18nSource, isUserVisibleText } from "./i18n-analyzer.mjs";

const knownKeys = new Set(["actions.save", "form.placeholder"]);

function inspect(source) {
  return inspectI18nSource({ path: "fixture.tsx", source, knownKeys });
}

describe("i18n AST analyzer", () => {
  it("detects visible JSX attributes, expressions, object labels, and helper returns", () => {
    const result = inspect(`
      const choices = [{ label: "Automatic" }];
      function connectionStatusLabel() {
        return ready ? "Running" : "Stopped";
      }
      export function Fixture() {
        return <input aria-label="Server address" placeholder={ready ? "Ready" : "Waiting"} />;
      }
    `);

    expect(result.hardcodedText.map((item) => item.detail)).toEqual(
      expect.arrayContaining(["Automatic", "Running", "Stopped", "Server address", "Ready", "Waiting"]),
    );
  });

  it("accepts static locale calls and reports undefined or dynamic keys", () => {
    const result = inspect(`
      const valid = t("actions.save");
      const missing = t("actions.missing");
      const dynamic = t(\`actions.\${action}\`);
    `);

    expect(result.invalidKeys).toHaveLength(1);
    expect(result.invalidKeys[0]?.detail).toBe("actions.missing");
    expect(result.dynamicKeys).toHaveLength(1);
  });

  it("allows centralized technical literals", () => {
    expect(isUserVisibleText("sing-box")).toBe(false);
    expect(isUserVisibleText("AES-256-GCM")).toBe(false);
    expect(isUserVisibleText("https://example.com/config.json")).toBe(false);
    expect(isUserVisibleText("Save changes")).toBe(true);
  });
});
