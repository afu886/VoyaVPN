import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLocale } from "@voya/i18n";
import { SourcesTab } from "@/features/settings/sources-tab";
import type {
  ConfigSourceSettings,
  ConfigTemplateImportResult,
  ConfigTemplateSelection,
} from "@/ipc/bindings";
import { useToastStore } from "@/stores/toast-store";

const ipcMocks = vi.hoisted(() => ({
  importConfigTemplate: vi.fn(),
  loadConfigSources: vi.fn(),
  saveConfigSources: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);

const initialSources = {
  geoSourceUrl: "https://sources.example.test/geo.json",
  routeRulesTemplateSourceUrl: "https://sources.example.test/routing.json",
  srsSourceUrl: "https://sources.example.test/srs.json",
} satisfies ConfigSourceSettings;

describe("SourcesTab", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
    useToastStore.setState({ toasts: [] });
    ipcMocks.loadConfigSources.mockResolvedValue(initialSources);
    ipcMocks.saveConfigSources.mockImplementation(async (settings: ConfigSourceSettings) => settings);
    ipcMocks.importConfigTemplate.mockResolvedValue(makeImportResult());
  });

  afterEach(() => {
    cleanup();
  });

  it("loads all three sources and saves trimmed values with blanks normalized to null", async () => {
    const user = userEvent.setup();
    const normalizedSources = {
      geoSourceUrl: "https://canonical.example.test/geo.json",
      routeRulesTemplateSourceUrl: "https://canonical.example.test/routing.json",
      srsSourceUrl: null,
    } satisfies ConfigSourceSettings;
    ipcMocks.saveConfigSources.mockResolvedValue(normalizedSources);

    renderSettings();
    await expectSources(initialSources);

    const inputs = getSourceInputs();
    fireEvent.change(inputs.geo, { target: { value: "  https://draft.example.test/geo.json  " } });
    fireEvent.change(inputs.srs, { target: { value: "   " } });
    fireEvent.change(inputs.routing, {
      target: { value: "  https://draft.example.test/routing.json  " },
    });

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(ipcMocks.saveConfigSources).toHaveBeenCalledWith({
        geoSourceUrl: "https://draft.example.test/geo.json",
        routeRulesTemplateSourceUrl: "https://draft.example.test/routing.json",
        srsSourceUrl: null,
      }),
    );
    await expectSources(normalizedSources);
  });

  it("opens with no selected template and keeps the form draft when cancelled", async () => {
    const user = userEvent.setup();
    renderSettings();
    await expectSources(initialSources);

    const draftGeoSource = "https://draft.example.test/geo.json";
    fireEvent.change(getSourceInputs().geo, { target: { value: draftGeoSource } });

    const dialog = await openImportDialog(user);
    const optionButtons = getTemplateOptionButtons(dialog);

    expect(optionButtons).toHaveLength(4);
    optionButtons.forEach((button) => expect(button).toHaveAttribute("aria-pressed", "false"));
    expect(within(dialog).getByRole("button", { name: "Import" })).toBeDisabled();

    await selectTemplate(user, dialog, "default");
    await user.click(getFooterCloseButton(dialog));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getSourceInputs().geo).toHaveValue(draftGeoSource);
    expect(ipcMocks.importConfigTemplate).not.toHaveBeenCalled();
  });

  it.each([
    {
      expectedError: "A routing template source URL is required for a custom import.",
      name: "a missing routing source",
      sources: { ...initialSources, routeRulesTemplateSourceUrl: null },
    },
    {
      expectedError: "Each custom source must be a valid HTTPS URL without credentials.",
      name: "an invalid source URL",
      sources: { ...initialSources, routeRulesTemplateSourceUrl: "http://sources.example.test/routes.json" },
    },
  ])("rejects $name without calling the import IPC", async ({ expectedError, sources }) => {
    const user = userEvent.setup();
    ipcMocks.loadConfigSources.mockResolvedValue(sources);
    renderSettings();
    await expectSources(sources);

    const dialog = await openImportDialog(user);
    await selectTemplate(user, dialog, "custom");
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(expectedError);
    expect(ipcMocks.importConfigTemplate).not.toHaveBeenCalled();
  });

  it("locks template choices and closing while an import is pending", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<ConfigTemplateImportResult>();
    ipcMocks.importConfigTemplate.mockReturnValue(deferred.promise);
    renderSettings();
    await expectSources(initialSources);

    const dialog = await openImportDialog(user);
    await selectTemplate(user, dialog, "russia");
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => expect(ipcMocks.importConfigTemplate).toHaveBeenCalledWith({ type: "russia" }));
    getTemplateOptionButtons(dialog).forEach((button) => expect(button).toBeDisabled());
    expect(getFooterCloseButton(dialog)).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Importing…" })).toBeDisabled();

    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();

    deferred.resolve(makeImportResult());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog selection and source draft after an import failure", async () => {
    const user = userEvent.setup();
    ipcMocks.importConfigTemplate.mockRejectedValue(new Error("routing template download failed"));
    renderSettings();
    await expectSources(initialSources);

    const draftRoute = "https://draft.example.test/custom-routes.json";
    const routingInput = getSourceInputs().routing;
    fireEvent.change(routingInput, { target: { value: draftRoute } });
    const dialog = await openImportDialog(user);
    const customButton = await selectTemplate(user, dialog, "custom");
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "routing template download failed",
    );
    expect(dialog).toBeInTheDocument();
    expect(customButton).toHaveAttribute("aria-pressed", "true");
    expect(routingInput).toHaveValue(draftRoute);
    expect(ipcMocks.importConfigTemplate).toHaveBeenCalledWith({
      sources: {
        ...initialSources,
        routeRulesTemplateSourceUrl: draftRoute,
      },
      type: "custom",
    } satisfies ConfigTemplateSelection);
  });

  it("uses normalized result sources, invalidates dependent queries, and reports success", async () => {
    const user = userEvent.setup();
    const result = makeImportResult({
      reusedExistingRouting: true,
      sources: {
        geoSourceUrl: "https://normalized.example.test/geo.json",
        routeRulesTemplateSourceUrl: "https://normalized.example.test/routes.json",
        srsSourceUrl: null,
      },
    });
    ipcMocks.importConfigTemplate.mockResolvedValue(result);
    const { invalidateQueries } = renderSettings();
    await expectSources(initialSources);

    const dialog = await openImportDialog(user);
    await selectTemplate(user, dialog, "default");
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await expectSources(result.sources);
    expect(ipcMocks.importConfigTemplate).toHaveBeenCalledWith({ type: "default" });
    expect(invalidateQueries).toHaveBeenCalledTimes(3);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["app-config"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dns"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["routings"] });
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({
      description:
        "Sources, DNS, and routing settings were updated, and the imported route was activated. " +
        "The matching routing template already existed and was reused and activated.",
      title: "Configuration template imported",
    });
  });

  it.each([
    { selection: "russia" as const, simpleDnsFetched: true, singboxDnsFetched: false },
    { selection: "iran" as const, simpleDnsFetched: false, singboxDnsFetched: true },
  ])(
    "warns after a $selection import when either DNS template was unavailable",
    async ({ selection, simpleDnsFetched, singboxDnsFetched }) => {
      const user = userEvent.setup();
      ipcMocks.importConfigTemplate.mockResolvedValue(
        makeImportResult({ simpleDnsFetched, singboxDnsFetched }),
      );
      renderSettings();
      await expectSources(initialSources);

      const dialog = await openImportDialog(user);
      await selectTemplate(user, dialog, selection);
      await user.click(within(dialog).getByRole("button", { name: "Import" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(useToastStore.getState().toasts.at(-1)?.description).toContain(
        "One or more DNS templates were unavailable. The fallback DNS configuration was kept.",
      );
    },
  );
});

function renderSettings() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false } },
  });
  const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

  render(
    <QueryClientProvider client={queryClient}>
      <SourcesTab />
    </QueryClientProvider>,
  );

  return { invalidateQueries, queryClient };
}

function getSourceInputs() {
  return {
    geo: screen.getByRole<HTMLInputElement>("textbox", { name: "Geo files source" }),
    routing: screen.getByRole<HTMLInputElement>("textbox", { name: "Routing template source" }),
    srs: screen.getByRole<HTMLInputElement>("textbox", { name: "sing-box ruleset source" }),
  };
}

async function expectSources(sources: ConfigSourceSettings) {
  await waitFor(() => {
    const inputs = getSourceInputs();
    expect(inputs.geo).toHaveValue(sources.geoSourceUrl ?? "");
    expect(inputs.routing).toHaveValue(sources.routeRulesTemplateSourceUrl ?? "");
    expect(inputs.srs).toHaveValue(sources.srsSourceUrl ?? "");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
}

async function openImportDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Import configuration template" }));
  return screen.getByRole("dialog", { name: "Import configuration template" });
}

async function selectTemplate(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  selection: "custom" | "default" | "iran" | "russia",
) {
  const labels = {
    custom: "Custom",
    default: "Default",
    iran: "Iran",
    russia: "Russia",
  } as const;
  const button = within(dialog).getByRole("button", {
    name: new RegExp(`^${labels[selection]}`),
  });
  await user.click(button);
  return button;
}

function getTemplateOptionButtons(dialog: HTMLElement) {
  return within(dialog)
    .getAllByRole("button")
    .filter((button) => button.hasAttribute("aria-pressed"));
}

function getFooterCloseButton(dialog: HTMLElement) {
  const footer = dialog.querySelector<HTMLElement>('[data-slot="dialog-footer"]');
  if (!footer) {
    throw new Error("Expected the import dialog footer.");
  }

  return within(footer).getByRole("button", { name: "Close" });
}

function makeImportResult(
  overrides: Partial<ConfigTemplateImportResult> = {},
): ConfigTemplateImportResult {
  return {
    activeRoutingId: "routing-imported",
    fallbackCustomDnsEnabled: false,
    reusedExistingRouting: false,
    routingIds: ["routing-imported"],
    simpleDnsFetched: true,
    singboxDnsFetched: true,
    sources: initialSources,
    ...overrides,
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T | PromiseLike<T>) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>["resolve"] | null = null;
  let reject: Deferred<T>["reject"] | null = null;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  if (!resolve || !reject) {
    throw new Error("Failed to create deferred promise.");
  }

  return { promise, reject, resolve };
}
