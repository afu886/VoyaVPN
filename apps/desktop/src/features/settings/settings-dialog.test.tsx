import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLocale } from "@voya/i18n";
import type { SettingsBundle_Serialize } from "@/ipc/bindings";

import { SettingsSurface } from "./settings-dialog";
import { SettingsWindow } from "./settings-window";

const ipcMocks = vi.hoisted(() => ({
  appUpdateStatus: vi.fn(),
  getWindowChromeConfig: vi.fn(),
  loadSettingsBundle: vi.fn(),
  saveSettingsBundle: vi.fn(),
  updateGeoAssets: vi.fn(),
  updateSrsAssets: vi.fn(),
}));
const updaterMocks = vi.hoisted(() => ({
  check: vi.fn(),
  getVersion: vi.fn(),
}));
const windowMocks = vi.hoisted(() => ({
  closeWindow: vi.fn(),
  onWindowCloseRequested: vi.fn(),
  setWindowTitle: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);
vi.mock("@/ipc/window", () => windowMocks);
vi.mock("@/ipc/process", () => ({ relaunch: vi.fn() }));
vi.mock("@/ipc/updater", () => updaterMocks);

describe("unified settings surface", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
    ipcMocks.getWindowChromeConfig.mockResolvedValue({ titleBarLayout: "none" });
    ipcMocks.appUpdateStatus.mockResolvedValue({ currentVersion: "0.1.0", message: null, state: "ready" });
    ipcMocks.loadSettingsBundle.mockResolvedValue(makeBundle());
    ipcMocks.saveSettingsBundle.mockImplementation(async (bundle) => bundle);
    ipcMocks.updateGeoAssets.mockResolvedValue([]);
    ipcMocks.updateSrsAssets.mockResolvedValue([]);
    updaterMocks.check.mockResolvedValue(null);
    updaterMocks.getVersion.mockResolvedValue("0.1.0");
    windowMocks.closeWindow.mockResolvedValue(undefined);
    windowMocks.onWindowCloseRequested.mockResolvedValue(() => undefined);
    windowMocks.setWindowTitle.mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it("keeps one draft across tabs and exposes no Hotkeys tab", async () => {
    const user = userEvent.setup();
    renderSurface();

    expect(await screen.findByRole("tab", { name: "General", selected: true })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Hotkeys" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Core" }));
    const userAgent = await screen.findByDisplayValue("agent-before-edit");
    await user.clear(userAgent);
    await user.type(userAgent, "agent-after-edit");
    await user.click(screen.getByRole("tab", { name: "Network" }));
    expect(await screen.findByLabelText("MTU")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Core" }));

    expect(screen.getByDisplayValue("agent-after-edit")).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(ipcMocks.loadSettingsBundle).toHaveBeenCalledTimes(1);
  });

  it("persists all edits through the single Save all action", async () => {
    const user = userEvent.setup();
    renderSurface();
    await user.click(await screen.findByRole("tab", { name: "Core" }));
    const userAgent = await screen.findByDisplayValue("agent-before-edit");
    await user.clear(userAgent);
    await user.type(userAgent, "saved-agent");

    await user.click(screen.getByRole("button", { name: "Save all" }));

    await waitFor(() => expect(ipcMocks.saveSettingsBundle).toHaveBeenCalledTimes(1));
    expect(ipcMocks.saveSettingsBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        coreBasicItem: expect.objectContaining({ DefUserAgent: "saved-agent" }),
      }),
    );
  });

  it("guards Escape close with save, discard, and cancel choices", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByRole("button", { name: "Light" }));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Unsaved settings");
    expect(windowMocks.closeWindow).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(windowMocks.closeWindow).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));
    await waitFor(() => expect(windowMocks.closeWindow).toHaveBeenCalledTimes(1));
  });
});

function renderSurface() {
  return renderWithQuery(<SettingsSurface />);
}

function renderWindow() {
  return renderWithQuery(<SettingsWindow />);
}

function renderWithQuery(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

function makeBundle(): SettingsBundle_Serialize {
  return {
    uiPreferences: { language: "en", theme: "system" },
    autostartEnabled: false,
    showWindowHotkey: { EGlobalHotkey: 0, Alt: true, Control: true, Shift: false, KeyCode: 86 },
    sources: { geoSourceUrl: null, routeRulesTemplateSourceUrl: null, srsSourceUrl: null },
    subConvertUrl: null,
    coreBasicItem: {
      LogEnabled: false,
      Loglevel: "warning",
      MuxEnabled: false,
      DefAllowInsecure: false,
      DefFingerprint: "chrome",
      DefUserAgent: "agent-before-edit",
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
  };
}
