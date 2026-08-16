import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeneralTab } from "@/features/settings/general-tab";
import { changeLocale } from "@voya/i18n";
import type { AutostartStatus } from "@/ipc/bindings";
import { usePreferencesStore } from "@/stores/preferences-store";

const ipcMocks = vi.hoisted(() => ({
  autostartStatus: vi.fn(),
  loadUiPreferences: vi.fn(),
  saveUiPreferences: vi.fn(),
  setAutostartEnabled: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);

describe("GeneralTab", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
    usePreferencesStore.getState().setThemeMode("system");
    mockDefaultIpc();
  });

  afterEach(() => {
    cleanup();
  });

  it("toggles autostart through the checkbox and shows the artifact path", async () => {
    const user = userEvent.setup();

    renderGeneralTab();

    const autostartCheckbox = await screen.findByRole("checkbox", { name: /^Autostart/ });
    await waitFor(() => expect(autostartCheckbox).toBeEnabled());
    expect(autostartCheckbox).not.toBeChecked();
    expect(screen.getByText(/VoyaVPN\.desktop/)).toBeInTheDocument();

    await user.click(autostartCheckbox);

    await waitFor(() => expect(ipcMocks.setAutostartEnabled).toHaveBeenCalledWith(true));
    await waitFor(() => expect(autostartCheckbox).toBeChecked());
  });

  it("groups startup options under an accessible group label", async () => {
    renderGeneralTab();

    expect(await screen.findByRole("group", { name: "Startup" })).toBeInTheDocument();
  });

  it("saves a theme change immediately and disables preference choices while saving", async () => {
    const user = userEvent.setup();
    let resolveSave: ((preferences: { language: string; theme: string }) => void) | undefined;
    ipcMocks.saveUiPreferences.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    renderGeneralTab();

    const lightButton = await screen.findByRole("button", { name: "Light" });
    await waitFor(() => expect(lightButton).toBeEnabled());
    await user.click(lightButton);

    expect(ipcMocks.saveUiPreferences).toHaveBeenCalledWith({
      language: "en",
      theme: "light",
    });
    expect(lightButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Dark" })).toBeDisabled();

    resolveSave?.({ language: "en", theme: "light" });
    await waitFor(() => expect(lightButton).toBeEnabled());
  });

  it("rolls back an optimistic preference change and displays the save error", async () => {
    const user = userEvent.setup();
    ipcMocks.saveUiPreferences.mockRejectedValue(new Error("preference save failed"));

    renderGeneralTab();

    const darkButton = await screen.findByRole("button", { name: "Dark" });
    await waitFor(() => expect(darkButton).toBeEnabled());
    await user.click(darkButton);

    expect(await screen.findByRole("alert")).toHaveTextContent("preference save failed");
    expect(screen.getByRole("button", { name: "Follow system" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(darkButton).toHaveAttribute("aria-pressed", "false");
  });
});

function renderGeneralTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <GeneralTab />
    </QueryClientProvider>,
  );
}

function mockDefaultIpc() {
  ipcMocks.loadUiPreferences.mockResolvedValue({ language: "en", theme: "system" });
  ipcMocks.saveUiPreferences.mockImplementation(async (preferences) => preferences);
  ipcMocks.autostartStatus.mockResolvedValue({
    artifactKind: null,
    artifactName: "VoyaVPN.desktop",
    artifactPath: "/home/test/.config/autostart/VoyaVPN.desktop",
    enabled: false,
    platform: "macos",
  } satisfies AutostartStatus);
  ipcMocks.setAutostartEnabled.mockImplementation(async (enabled: boolean) => ({
    artifactKind: null,
    artifactName: "VoyaVPN.desktop",
    artifactPath: "/home/test/.config/autostart/VoyaVPN.desktop",
    enabled,
    platform: "macos",
  }));
}
