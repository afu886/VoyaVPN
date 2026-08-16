import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModalHost } from "@/components/app-shell/modal-host";
import { changeLocale } from "@voya/i18n";
import { useModalStore } from "@/stores/modal-store";

const ipcMocks = vi.hoisted(() => ({
  autostartStatus: vi.fn(),
  connectActiveProfile: vi.fn(),
  globalHotkeyStatus: vi.fn(),
  installCoreSeed: vi.fn(),
  loadAppConfig: vi.fn(),
  loadConfigSources: vi.fn(),
  saveAppConfig: vi.fn(),
  saveConfigSources: vi.fn(),
  saveGlobalHotkeys: vi.fn(),
  setAutostartEnabled: vi.fn(),
  importConfigTemplate: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);
vi.mock("@/features/templates", () => ({
  FullConfigTemplateDialog: () => <div data-testid="templates-dialog" />,
}));
vi.mock("@/features/updates", () => ({
  UpdatesPanel: () => <div data-testid="updates-panel" />,
}));

describe("ModalHost", () => {
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

  it("hosts child dialogs without owning the settings surface", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ModalHost />
      </QueryClientProvider>,
    );

    act(() => {
      useModalStore.getState().openModal("fullConfigTemplate");
    });

    await screen.findByTestId("templates-dialog");
    expect(screen.queryByRole("tab", { name: "General" })).not.toBeInTheDocument();

    act(() => {
      useModalStore.getState().closeTopModal();
    });

    expect(screen.queryByTestId("templates-dialog")).not.toBeInTheDocument();
  });
});
