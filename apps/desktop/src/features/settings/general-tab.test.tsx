import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeneralTab } from "@/features/settings/general-tab";
import { changeLocale } from "@voya/i18n";
import type { AutostartStatus, DiagnosticsStatus } from "@/ipc/bindings";

const ipcMocks = vi.hoisted(() => ({
  autostartStatus: vi.fn(),
  diagnosticsStatus: vi.fn(),
  setAutostartEnabled: vi.fn(),
  setDiagnosticsEnabled: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);

describe("GeneralTab", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
    mockDefaultIpc();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows diagnostics enabled by default and persists opt-out", async () => {
    const user = userEvent.setup();

    render(<GeneralTab />);

    const diagnosticsCheckbox = await screen.findByRole("checkbox", {
      name: /Release health diagnostics/,
    });
    await waitFor(() => expect(diagnosticsCheckbox).toBeEnabled());
    expect(diagnosticsCheckbox).toBeChecked();
    expect(screen.getByText("No node, subscription, traffic, or config details.")).toBeInTheDocument();

    await user.click(diagnosticsCheckbox);

    await waitFor(() => expect(ipcMocks.setDiagnosticsEnabled).toHaveBeenCalledWith(false));
    await waitFor(() => expect(diagnosticsCheckbox).not.toBeChecked());
  });

  it("redacts sensitive diagnostics IPC errors before rendering", async () => {
    ipcMocks.diagnosticsStatus.mockRejectedValue(
      new Error(
        "failed at https://diagnostics.voyavpn.test/ingest proxyUrl=http://127.0.0.1:10808 vless://secret@example.com",
      ),
    );

    render(<GeneralTab />);

    const error = await screen.findByText(/failed at/);
    expect(error).toHaveTextContent("[redacted URL]");
    expect(error).toHaveTextContent("proxyUrl=[redacted]");
    expect(error).toHaveTextContent("[redacted]");
    expect(screen.queryByText(/diagnostics\.voyavpn\.test/)).not.toBeInTheDocument();
    expect(screen.queryByText(/127\.0\.0\.1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/vless:\/\//)).not.toBeInTheDocument();
  });

  it("toggles autostart through the checkbox and shows the artifact path", async () => {
    const user = userEvent.setup();

    render(<GeneralTab />);

    const autostartCheckbox = await screen.findByRole("checkbox", { name: /^Autostart/ });
    await waitFor(() => expect(autostartCheckbox).toBeEnabled());
    expect(autostartCheckbox).not.toBeChecked();
    expect(screen.getByText(/VoyaVPN\.desktop/)).toBeInTheDocument();

    await user.click(autostartCheckbox);

    await waitFor(() => expect(ipcMocks.setAutostartEnabled).toHaveBeenCalledWith(true));
    await waitFor(() => expect(autostartCheckbox).toBeChecked());
  });

  it("groups startup options under an accessible group label", async () => {
    render(<GeneralTab />);

    expect(await screen.findByRole("group", { name: "Startup & diagnostics" })).toBeInTheDocument();
  });
});

function mockDefaultIpc() {
  ipcMocks.autostartStatus.mockResolvedValue({
    artifactKind: null,
    artifactName: "VoyaVPN.desktop",
    artifactPath: "/home/test/.config/autostart/VoyaVPN.desktop",
    enabled: false,
    platform: "macos",
  } satisfies AutostartStatus);
  ipcMocks.diagnosticsStatus.mockResolvedValue(makeDiagnosticsStatus(true));
  ipcMocks.setAutostartEnabled.mockImplementation(async (enabled: boolean) => ({
    artifactKind: null,
    artifactName: "VoyaVPN.desktop",
    artifactPath: "/home/test/.config/autostart/VoyaVPN.desktop",
    enabled,
    platform: "macos",
  }));
  ipcMocks.setDiagnosticsEnabled.mockImplementation(async (enabled: boolean) =>
    makeDiagnosticsStatus(enabled),
  );
}

function makeDiagnosticsStatus(enabled: boolean): DiagnosticsStatus {
  return {
    deliveryConfigured: false,
    enabled,
    queuedBytes: 0,
    queuedEvents: 0,
  };
}
