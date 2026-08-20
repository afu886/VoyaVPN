import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSettingsV1 } from "@/ipc/bindings";
import { useToastStore } from "@/stores/toast-store";

import { makeAppSettings } from "./app-settings.test-fixture";
import { SourcesTab } from "./sources-tab";
import type { AppSettingsController } from "./use-app-settings";

const ipcMocks = vi.hoisted(() => ({ importConfigTemplate: vi.fn() }));

vi.mock("@/ipc", () => ipcMocks);

describe("SourcesTab", () => {
  beforeEach(() => {
    ipcMocks.importConfigTemplate.mockReset();
    ipcMocks.importConfigTemplate.mockResolvedValue({
      importedRoutingId: "routing-default",
      reusedExistingRouting: false,
    });
    useToastStore.setState({ toasts: [] });
  });

  it("shows loading and load errors before settings are available", () => {
    const { rerender } = renderTab(controllerWithoutSettings(true, null));
    expect(screen.getByText("Loading")).toBeInTheDocument();

    rerender(withQuery(<SourcesTab controller={controllerWithoutSettings(false, "load failed")} />));
    expect(screen.getByText("load failed")).toBeInTheDocument();
  });

  it("updates the canonical source settings and blocks actions for a dirty draft", async () => {
    const user = userEvent.setup();
    renderTab(<SourcesHarness dirty />);

    const geo = screen.getByLabelText("Geo files source");
    await user.type(geo, "https://geo.example.test/files");
    expect(geo).toHaveValue("https://geo.example.test/files");
    expect(screen.getByRole("button", { name: "Import configuration template" })).toBeDisabled();
    expect(screen.getByText("Save or discard pending changes before running this action.")).toBeInTheDocument();
  });

  it("rejects incomplete and non-HTTPS custom source documents", async () => {
    const user = userEvent.setup();
    renderTab(<SourcesHarness />);

    await user.click(screen.getByRole("button", { name: "Import configuration template" }));
    await user.click(screen.getByRole("button", { name: /Custom/ }));
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByText("A routing template source URL is required for a custom import.")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Close" })[0]);
    await user.type(screen.getByLabelText("Routing template source"), "http://routing.example.test/template.json");
    await user.click(screen.getByRole("button", { name: "Import configuration template" }));
    await user.click(screen.getByRole("button", { name: /Custom/ }));
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByText("Each custom source must be a valid HTTPS URL without credentials.")).toBeInTheDocument();
    expect(ipcMocks.importConfigTemplate).not.toHaveBeenCalled();
  });

  it("imports a strict custom template, reloads settings, and reports reuse", async () => {
    const user = userEvent.setup();
    const reload = vi.fn().mockResolvedValue(undefined);
    ipcMocks.importConfigTemplate.mockResolvedValue({
      importedRoutingId: "routing-existing",
      reusedExistingRouting: true,
    });
    renderTab(<SourcesHarness reload={reload} settings={settingsWithSources()} />);

    await user.click(screen.getByRole("button", { name: "Import configuration template" }));
    await user.click(screen.getByRole("button", { name: /Custom/ }));
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(ipcMocks.importConfigTemplate).toHaveBeenCalledWith({
      sources: {
        geoSourceUrl: "https://geo.example.test/files",
        routeRulesTemplateSourceUrl: "https://routing.example.test/template.json",
        srsSourceUrl: "https://srs.example.test/files",
      },
      type: "custom",
    }));
    expect(reload).toHaveBeenCalledOnce();
    expect(useToastStore.getState().toasts[0]?.description).toContain("already existed");
  });

  it("surfaces backend import failures and can close the selection dialog", async () => {
    const user = userEvent.setup();
    ipcMocks.importConfigTemplate.mockRejectedValue(new Error("template unavailable"));
    renderTab(<SourcesHarness />);

    await user.click(screen.getByRole("button", { name: "Import configuration template" }));
    await user.click(screen.getByRole("button", { name: /Default/ }));
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("template unavailable")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Close" })[0]);
    expect(screen.queryByRole("dialog", { name: "Import configuration template" })).not.toBeInTheDocument();
  });
});

function SourcesHarness({
  dirty = false,
  reload = vi.fn().mockResolvedValue(undefined),
  settings: initialSettings = makeAppSettings(),
}: {
  dirty?: boolean;
  reload?: () => Promise<void>;
  settings?: AppSettingsV1;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const controller: AppSettingsController = {
    dirty,
    discard: async () => undefined,
    error: null,
    reload,
    save: async () => true,
    saved: false,
    setAppearance: vi.fn(),
    settings,
    update: setSettings,
    working: false,
  };
  return <SourcesTab controller={controller} />;
}

function controllerWithoutSettings(working: boolean, error: string | null): AppSettingsController {
  return {
    dirty: false,
    discard: async () => undefined,
    error,
    reload: async () => undefined,
    save: async () => false,
    saved: false,
    setAppearance: vi.fn(),
    settings: null,
    update: vi.fn(),
    working,
  };
}

function settingsWithSources() {
  const settings = makeAppSettings();
  settings.sources = {
    geo: "https://geo.example.test/files",
    routingTemplate: "https://routing.example.test/template.json",
    singboxRuleset: "https://srs.example.test/files",
    subscriptionConverter: null,
  };
  return settings;
}

function renderTab(children: React.ReactNode | AppSettingsController) {
  const content = "settings" in (children as AppSettingsController)
    ? <SourcesTab controller={children as AppSettingsController} />
    : children as React.ReactNode;
  return render(withQuery(content));
}

function withQuery(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
