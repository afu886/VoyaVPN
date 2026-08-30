import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLocale } from "@voya/i18n";
import { makeAppSettings } from "./app-settings.test-fixture";
import { SettingsSurface } from "./settings-dialog";
import { SettingsWindow } from "./settings-window";

const ipcMocks = vi.hoisted(() => ({
  appUpdateStatus: vi.fn(),
  getWindowChromeConfig: vi.fn(),
  loadAppSettings: vi.fn(),
  saveAppSettings: vi.fn(),
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

type CloseRequestedHandler = (event: { preventDefault: () => void }) => void;

let closeRequestedHandler: CloseRequestedHandler | undefined;
let windowClosed = false;

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
    ipcMocks.loadAppSettings.mockResolvedValue(makeAppSettings());
    ipcMocks.saveAppSettings.mockImplementation(async (settings) => settings);
    ipcMocks.updateGeoAssets.mockResolvedValue([]);
    ipcMocks.updateSrsAssets.mockResolvedValue([]);
    updaterMocks.check.mockResolvedValue(null);
    updaterMocks.getVersion.mockResolvedValue("0.1.0");
    closeRequestedHandler = undefined;
    windowClosed = false;
    windowMocks.closeWindow.mockImplementation(async () => {
      dispatchCloseRequest();
    });
    windowMocks.onWindowCloseRequested.mockImplementation(async (handler: CloseRequestedHandler) => {
      closeRequestedHandler = handler;
      return () => {
        if (closeRequestedHandler === handler) closeRequestedHandler = undefined;
      };
    });
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
    expect(ipcMocks.loadAppSettings).toHaveBeenCalledTimes(1);
  });

  it("persists all edits through the single Save all action", async () => {
    const user = userEvent.setup();
    renderSurface();
    await user.click(await screen.findByRole("tab", { name: "Core" }));
    const userAgent = await screen.findByDisplayValue("agent-before-edit");
    await user.clear(userAgent);
    await user.type(userAgent, "saved-agent");

    await user.click(screen.getByRole("button", { name: "Save all" }));

    await waitFor(() => expect(ipcMocks.saveAppSettings).toHaveBeenCalledTimes(1));
    expect(ipcMocks.saveAppSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        core: expect.objectContaining({ defaultUserAgent: "saved-agent" }),
      }),
    );
  });

  it("closes a clean settings window immediately", async () => {
    renderWindow();
    await screen.findByRole("region", { name: "Settings" });
    await waitFor(() => expect(windowMocks.onWindowCloseRequested).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(windowMocks.closeWindow).toHaveBeenCalledTimes(1));
    expect(windowClosed).toBe(true);
  });

  it("guards a native close request while settings are dirty and honors cancel", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByRole("button", { name: "Light" }));
    await waitFor(() => expect(windowMocks.onWindowCloseRequested).toHaveBeenCalledTimes(1));

    expect(dispatchCloseRequest()).toBe(true);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Unsaved settings");
    expect(windowMocks.closeWindow).not.toHaveBeenCalled();
    expect(windowClosed).toBe(false);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(windowMocks.closeWindow).not.toHaveBeenCalled();
    expect(windowClosed).toBe(false);
  });

  it("discards dirty settings and allows the reentrant close request", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByRole("button", { name: "Light" }));

    fireEvent.keyDown(window, { key: "Escape" });
    await user.click(await screen.findByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(windowMocks.closeWindow).toHaveBeenCalledTimes(1));
    expect(windowClosed).toBe(true);
  });

  it("saves dirty settings and allows the reentrant close request", async () => {
    const user = userEvent.setup();
    renderWindow();
    await user.click(await screen.findByRole("button", { name: "Light" }));

    fireEvent.keyDown(window, { key: "Escape" });
    await user.click(await screen.findByRole("button", { name: "Save all" }));

    await waitFor(() => expect(ipcMocks.saveAppSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(windowMocks.closeWindow).toHaveBeenCalledTimes(1));
    expect(windowClosed).toBe(true);
  });

  it("keeps the window open when saving dirty settings fails", async () => {
    const user = userEvent.setup();
    ipcMocks.saveAppSettings.mockRejectedValueOnce(new Error("save failed"));
    renderWindow();
    await user.click(await screen.findByRole("button", { name: "Light" }));

    fireEvent.keyDown(window, { key: "Escape" });
    await user.click(await screen.findByRole("button", { name: "Save all" }));

    await waitFor(() => expect(ipcMocks.saveAppSettings).toHaveBeenCalledTimes(1));
    expect(windowMocks.closeWindow).not.toHaveBeenCalled();
    expect(windowClosed).toBe(false);
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });
});

function dispatchCloseRequest() {
  const preventDefault = vi.fn();
  closeRequestedHandler?.({ preventDefault });
  const prevented = preventDefault.mock.calls.length > 0;
  if (!prevented) windowClosed = true;
  return prevented;
}

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
