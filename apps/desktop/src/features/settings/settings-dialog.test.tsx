import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "@voya/ui/components/dialog";
import { SettingsDialog } from "@/features/settings/settings-dialog";
import { changeLocale } from "@voya/i18n";
import { useModalStore, type SettingsTab } from "@/stores/modal-store";

const ipcMocks = vi.hoisted(() => ({
  appUpdateStatus: vi.fn(),
  autostartStatus: vi.fn(),
  checkUpdates: vi.fn(),
  diagnosticsStatus: vi.fn(),
  downloadUpdates: vi.fn(),
  globalHotkeyStatus: vi.fn(),
  importConfigTemplate: vi.fn(),
  loadAppConfig: vi.fn(),
  loadConfigSources: vi.fn(),
  manualAppUpdateLinks: vi.fn(),
  recordAppUpdateDiagnostic: vi.fn(),
  saveAppConfig: vi.fn(),
  saveConfigSources: vi.fn(),
  saveGlobalHotkeys: vi.fn(),
  saveUpdatePreferences: vi.fn(),
  setAutostartEnabled: vi.fn(),
  setDiagnosticsEnabled: vi.fn(),
  updateStatus: vi.fn(),
}));
const tauriMocks = vi.hoisted(() => ({
  check: vi.fn(),
  getVersion: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);
vi.mock("@/ipc/process", () => ({ relaunch: tauriMocks.relaunch }));
vi.mock("@/ipc/updater", () => ({
  check: tauriMocks.check,
  getVersion: tauriMocks.getVersion,
}));

describe("SettingsDialog", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
    useModalStore.setState({ stack: [] });
    mockDefaultIpc();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens on the General tab and switches panes through the tab strip", async () => {
    const user = userEvent.setup();

    renderDialog();

    expect(await screen.findByRole("tab", { name: "General", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(ipcMocks.loadConfigSources).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Sources" }));

    expect(await screen.findByLabelText("Geo files source")).toBeInTheDocument();
    await waitFor(() => expect(ipcMocks.loadConfigSources).toHaveBeenCalledTimes(1));
  });

  it("deep-links to the requested tab via initialTab", async () => {
    renderDialog({ initialTab: "updates" });

    expect(await screen.findByRole("tab", { name: "Updates", selected: true })).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "Pre-release" })).toBeInTheDocument();
    await waitFor(() => expect(ipcMocks.updateStatus).toHaveBeenCalledTimes(1));
  });

  it("mounts the updates pane on first visit only and keeps it mounted afterwards", async () => {
    const user = userEvent.setup();

    renderDialog();

    await screen.findByRole("tab", { name: "General", selected: true });
    expect(ipcMocks.updateStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Updates" }));
    await waitFor(() => expect(ipcMocks.updateStatus).toHaveBeenCalledTimes(1));
    const preRelease = await screen.findByRole("checkbox", { name: "Pre-release" });

    await user.click(screen.getByRole("tab", { name: "General" }));
    // Hidden, not unmounted: the controller instance (and its coalesced
    // preference-save chain) must survive tab switches.
    expect(preRelease).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Updates" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Updates" })).toHaveAttribute("aria-selected", "true"));
    expect(ipcMocks.updateStatus).toHaveBeenCalledTimes(1);
  });

  it("keeps unsaved runtime edits when switching between runtime tabs", async () => {
    const user = userEvent.setup();

    renderDialog();

    await user.click(await screen.findByRole("tab", { name: "Core" }));
    const userAgent = await screen.findByDisplayValue("agent-before-edit");
    await user.clear(userAgent);
    await user.type(userAgent, "agent-after-edit");

    await user.click(screen.getByRole("tab", { name: "Network" }));
    expect(await screen.findByLabelText("MTU")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Core" }));
    expect(screen.getByDisplayValue("agent-after-edit")).toBeInTheDocument();
    expect(ipcMocks.loadAppConfig).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open when Escape is pressed while recording a hotkey", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    ipcMocks.globalHotkeyStatus.mockResolvedValue({
      actions: [{ action: 0, label: "Show window" }],
      registered: [],
      settings: [{ Alt: false, Control: false, EGlobalHotkey: 0, KeyCode: null, Shift: false }],
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Dialog onOpenChange={onOpenChange} open>
          <SettingsDialog />
        </Dialog>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("tab", { name: "Hotkeys" }));
    const capture = await screen.findByRole("textbox", { name: "Hotkey key" });
    capture.focus();
    fireEvent.keyDown(capture, { key: "Escape", keyCode: 27 });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(capture).toHaveValue("Esc");

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("persists the active tab onto its modal entry so stacked dialogs can restore it", async () => {
    const user = userEvent.setup();
    useModalStore.setState({ stack: [{ id: "settings-1", kind: "settings" }] });

    renderDialog({ entryId: "settings-1" });

    await user.click(await screen.findByRole("tab", { name: "Sources" }));

    expect(useModalStore.getState().stack[0]?.settingsTab).toBe("sources");
  });
});

function renderDialog(props: { entryId?: string; initialTab?: SettingsTab } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <Dialog open>
        <SettingsDialog {...props} />
      </Dialog>
    </QueryClientProvider>,
  );
}

function mockDefaultIpc() {
  ipcMocks.loadAppConfig.mockResolvedValue({
    CoreBasicItem: { DefUserAgent: "agent-before-edit" },
  });
  ipcMocks.saveAppConfig.mockImplementation(async (config: unknown) => config);
  ipcMocks.autostartStatus.mockResolvedValue({
    artifactKind: null,
    artifactName: null,
    artifactPath: null,
    enabled: false,
    platform: "macos",
  });
  ipcMocks.setAutostartEnabled.mockImplementation(async (enabled: boolean) => ({
    artifactKind: null,
    artifactName: null,
    artifactPath: null,
    enabled,
    platform: "macos",
  }));
  ipcMocks.diagnosticsStatus.mockResolvedValue({
    deliveryConfigured: false,
    enabled: true,
    queuedBytes: 0,
    queuedEvents: 0,
  });
  ipcMocks.setDiagnosticsEnabled.mockImplementation(async (enabled: boolean) => ({
    deliveryConfigured: false,
    enabled,
    queuedBytes: 0,
    queuedEvents: 0,
  }));
  ipcMocks.loadConfigSources.mockResolvedValue({
    geoSourceUrl: null,
    routeRulesTemplateSourceUrl: null,
    srsSourceUrl: null,
  });
  ipcMocks.saveConfigSources.mockImplementation(async (settings: unknown) => settings);
  ipcMocks.globalHotkeyStatus.mockResolvedValue({ actions: [], registered: [], settings: [] });
  ipcMocks.saveGlobalHotkeys.mockResolvedValue({ actions: [], registered: [], settings: [] });
  ipcMocks.updateStatus.mockResolvedValue({ preRelease: false, targets: [] });
  ipcMocks.saveUpdatePreferences.mockResolvedValue({ preRelease: false, targets: [] });
  ipcMocks.checkUpdates.mockResolvedValue({ preRelease: false, results: [], targets: [] });
  ipcMocks.downloadUpdates.mockResolvedValue({ preRelease: false, results: [], targets: [] });
  ipcMocks.appUpdateStatus.mockResolvedValue({ currentVersion: "1.0.0", message: null, state: "ready" });
  ipcMocks.manualAppUpdateLinks.mockResolvedValue({
    arch: "x64",
    channel: "stable",
    currentVersion: "1.0.0",
    downloads: [],
    hasUpdate: false,
    releaseIndexUrl: "https://cdn.voyavpn.test/stable/release-index.json",
    remoteVersion: null,
    target: "linux",
  });
  ipcMocks.recordAppUpdateDiagnostic.mockResolvedValue(undefined);
  tauriMocks.check.mockResolvedValue(null);
  tauriMocks.getVersion.mockResolvedValue("1.0.0");
  tauriMocks.relaunch.mockResolvedValue(undefined);
}
