import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModalHost } from "@/components/app-shell/modal-host";
import { changeLocale } from "@voya/i18n";
import { useModalStore } from "@/stores/modal-store";

const ipcMocks = vi.hoisted(() => ({
  autostartStatus: vi.fn(),
  connectActiveProfile: vi.fn(),
  diagnosticsStatus: vi.fn(),
  globalHotkeyStatus: vi.fn(),
  installCoreSeed: vi.fn(),
  loadAppConfig: vi.fn(),
  loadConfigSources: vi.fn(),
  saveAppConfig: vi.fn(),
  saveConfigSources: vi.fn(),
  saveGlobalHotkeys: vi.fn(),
  setAutostartEnabled: vi.fn(),
  setDiagnosticsEnabled: vi.fn(),
  importConfigTemplate: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);
vi.mock("@/features/qr", () => ({
  QrDialog: () => <div data-testid="qr-dialog" />,
}));
vi.mock("@/features/templates", () => ({
  FullConfigTemplateDialog: () => <div data-testid="templates-dialog" />,
}));
vi.mock("@/features/updates", () => ({
  UpdatesPanel: () => <div data-testid="updates-panel" />,
}));

describe("ModalHost settings tab restore", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
    useModalStore.setState({ stack: [] });
    ipcMocks.loadAppConfig.mockResolvedValue({});
    ipcMocks.autostartStatus.mockResolvedValue({
      artifactKind: null,
      artifactName: null,
      artifactPath: null,
      enabled: false,
      platform: "macos",
    });
    ipcMocks.diagnosticsStatus.mockResolvedValue({
      deliveryConfigured: false,
      enabled: true,
      queuedBytes: 0,
      queuedEvents: 0,
    });
    ipcMocks.loadConfigSources.mockResolvedValue({
      geoSourceUrl: null,
      routeRulesTemplateSourceUrl: null,
      srsSourceUrl: null,
    });
    ipcMocks.globalHotkeyStatus.mockResolvedValue({ actions: [], registered: [], settings: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("restores the active settings tab after a stacked dialog closes", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ModalHost />
      </QueryClientProvider>,
    );

    act(() => {
      useModalStore.getState().openModal("settings");
    });

    await user.click(await screen.findByRole("tab", { name: "Sources" }));
    await screen.findByLabelText("Geo files source");

    // The templates dialog stacks above Settings; ModalHost only renders the
    // top of the stack, so the settings content unmounts entirely.
    act(() => {
      useModalStore.getState().openModal("fullConfigTemplate");
    });
    await screen.findByTestId("templates-dialog");
    await waitFor(() =>
      expect(screen.queryByRole("tab", { name: "Sources" })).not.toBeInTheDocument(),
    );

    act(() => {
      useModalStore.getState().closeTopModal();
    });

    expect(await screen.findByRole("tab", { name: "Sources", selected: true })).toBeInTheDocument();
  });
});
