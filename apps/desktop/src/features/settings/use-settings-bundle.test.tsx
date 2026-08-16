import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SettingsBundle_Serialize, UiPreferences } from "@/ipc/bindings";

import { useSettingsBundle } from "./use-settings-bundle";

const ipcMocks = vi.hoisted(() => ({
  loadSettingsBundle: vi.fn(),
  saveSettingsBundle: vi.fn(),
}));
const preferenceMocks = vi.hoisted(() => ({
  applyUiPreferences: vi.fn((preferences: UiPreferences) => {
    void preferences;
    return Promise.resolve();
  }),
}));

vi.mock("@/ipc", () => ipcMocks);
vi.mock("@/features/settings/ui-preferences", () => ({
  applyUiPreferences: preferenceMocks.applyUiPreferences,
  UI_PREFERENCES_QUERY_KEY: ["ui-preferences"],
}));

describe("useSettingsBundle", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
    ipcMocks.loadSettingsBundle.mockResolvedValue(makeBundle());
    ipcMocks.saveSettingsBundle.mockImplementation(async (bundle) => bundle);
  });

  afterEach(cleanup);

  it("saves cross-section edits as one authoritative bundle", async () => {
    const user = userEvent.setup();
    renderProbe();
    await screen.findByText("clean");

    await user.click(screen.getByRole("button", { name: "Edit two sections" }));
    expect(screen.getByTestId("state")).toHaveTextContent("dirty");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(ipcMocks.saveSettingsBundle).toHaveBeenCalledTimes(1));
    expect(ipcMocks.saveSettingsBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        subConvertUrl: "https://convert.example.test",
        coreBasicItem: expect.objectContaining({ Loglevel: "debug" }),
      }),
    );
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("clean"));
  });

  it("previews theme changes and restores the original preference on discard", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("voyavpn.preferences", "stored-theme");
    window.localStorage.setItem("voyavpn.locale", "zh-Hans");
    preferenceMocks.applyUiPreferences.mockImplementation(async (preferences) => {
      window.localStorage.setItem("voyavpn.preferences", JSON.stringify(preferences.theme));
      window.localStorage.setItem("voyavpn.locale", preferences.language);
    });
    renderProbe();
    await screen.findByText("clean");

    await user.click(screen.getByRole("button", { name: "Preview dark" }));
    await waitFor(() =>
      expect(preferenceMocks.applyUiPreferences).toHaveBeenCalledWith({ language: "en", theme: "dark" }),
    );
    await waitFor(() => {
      expect(window.localStorage.getItem("voyavpn.preferences")).toBe("stored-theme");
      expect(window.localStorage.getItem("voyavpn.locale")).toBe("zh-Hans");
    });
    await user.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() =>
      expect(preferenceMocks.applyUiPreferences).toHaveBeenLastCalledWith({ language: "en", theme: "system" }),
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("state")).toHaveTextContent("clean");
  });

  it("reloads the authoritative snapshot after a failed save", async () => {
    const user = userEvent.setup();
    const authoritative = makeBundle({ subConvertUrl: "https://authoritative.example.test" });
    ipcMocks.loadSettingsBundle
      .mockResolvedValueOnce(makeBundle())
      .mockResolvedValueOnce(authoritative);
    ipcMocks.saveSettingsBundle.mockRejectedValue(new Error("save failed"));
    renderProbe();
    await screen.findByText("clean");

    await user.click(screen.getByRole("button", { name: "Edit two sections" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("save failed");
    await waitFor(() =>
      expect(screen.getByTestId("converter")).toHaveTextContent("https://authoritative.example.test"),
    );
    expect(screen.getByTestId("state")).toHaveTextContent("clean");
  });
});

function Probe() {
  const controller = useSettingsBundle();
  if (!controller.bundle) return <div>loading</div>;
  return (
    <div>
      <div data-testid="state">{controller.dirty ? "dirty" : "clean"}</div>
      <div data-testid="theme">{controller.bundle.uiPreferences.theme}</div>
      <div data-testid="converter">{controller.bundle.subConvertUrl ?? "none"}</div>
      {controller.error ? <div role="alert">{controller.error}</div> : null}
      <button
        onClick={() =>
          controller.update((bundle) => ({
            ...bundle,
            subConvertUrl: "https://convert.example.test",
            coreBasicItem: { ...bundle.coreBasicItem, Loglevel: "debug" },
          }))
        }
        type="button"
      >
        Edit two sections
      </button>
      <button
        onClick={() =>
          controller.setUiPreferences({ ...controller.bundle!.uiPreferences, theme: "dark" })
        }
        type="button"
      >
        Preview dark
      </button>
      <button onClick={() => void controller.discard()} type="button">Discard</button>
      <button onClick={() => void controller.save()} type="button">Save</button>
    </div>
  );
}

function renderProbe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

function makeBundle(
  overrides: Partial<SettingsBundle_Serialize> = {},
): SettingsBundle_Serialize {
  return {
    uiPreferences: { language: "en", theme: "system" },
    autostartEnabled: false,
    showWindowHotkey: {
      EGlobalHotkey: 0,
      Alt: true,
      Control: true,
      Shift: false,
      KeyCode: 86,
    },
    sources: {
      geoSourceUrl: null,
      routeRulesTemplateSourceUrl: null,
      srsSourceUrl: null,
    },
    subConvertUrl: null,
    coreBasicItem: {
      LogEnabled: false,
      Loglevel: "warning",
      MuxEnabled: false,
      DefAllowInsecure: false,
      DefFingerprint: "chrome",
      DefUserAgent: "",
      EnableFragment: false,
      EnableCacheFile4Sbox: true,
    },
    mux4SboxItem: { Protocol: "h2mux", MaxConnections: 4, Padding: false },
    hysteriaItem: { UpMbps: 100, DownMbps: 100, HopInterval: 30 },
    network: {
      tun: {
        autoRoute: true,
        strictRoute: true,
        stack: "system",
        mtu: 9000,
        enableIpv6Address: false,
        icmpRouting: "",
        enableLegacyProtect: false,
      },
      systemProxy: {
        systemProxyExceptions: "",
        notProxyLocalAddress: true,
        systemProxyAdvancedProtocol: "",
        customSystemProxyPacPath: null,
        customSystemProxyScriptPath: null,
      },
    },
    speedTestItem: {
      SpeedTestTimeout: 10,
      SpeedTestUrl: "https://speed.example.test",
      SpeedPingTestUrl: "https://ping.example.test",
      MixedConcurrencyCount: 4,
      IPAPIUrl: "https://ip.example.test",
      UdpTestTarget: "1.1.1.1:53",
      SpeedTestPageSize: 10,
      SpeedTestDelayInterval: 1,
    },
    ...overrides,
  };
}
