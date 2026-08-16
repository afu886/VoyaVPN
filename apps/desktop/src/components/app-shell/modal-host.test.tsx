import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ModalHost } from "@/components/app-shell/modal-host";
import { changeLocale } from "@voya/i18n";
import { useModalStore } from "@/stores/modal-store";

const ipcMocks = vi.hoisted(() => ({
  connectActiveProfile: vi.fn(),
  installCoreSeed: vi.fn(),
  loadAppConfig: vi.fn(),
  loadConfigSources: vi.fn(),
  importConfigTemplate: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);
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
    ipcMocks.loadConfigSources.mockResolvedValue({
      geoSourceUrl: null,
      routeRulesTemplateSourceUrl: null,
      srsSourceUrl: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not expose the retired full config template surface", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: 0, retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ModalHost />
      </QueryClientProvider>,
    );

    expect(screen.queryByTestId("templates-dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "General" })).not.toBeInTheDocument();
  });
});
