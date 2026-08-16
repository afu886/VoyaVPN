import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLocale } from "@voya/i18n";
import { CoreTab } from "@/features/settings/core-tab";
import { TestsTab } from "@/features/settings/tests-tab";
import { useRuntimeConfig } from "@/features/settings/use-runtime-config";
import type { AppConfig_Serialize } from "@/ipc/bindings";

const ipcMocks = vi.hoisted(() => ({
  loadAppConfig: vi.fn(),
  saveAppConfig: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);

function CoreHarness() {
  return <CoreTab controller={useRuntimeConfig()} />;
}

function TestsHarness() {
  return <TestsTab controller={useRuntimeConfig()} />;
}

describe("runtime config tabs", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves the latest sources and shell-owned settings when saving runtime settings", async () => {
    const user = userEvent.setup();
    const initialConfig = makeConfig({
      ConstItem: {
        GeoSourceUrl: "https://old.example/geo.json",
        RouteRulesTemplateSourceUrl: "https://old.example/routes.json",
        SrsSourceUrl: "https://old.example/srs.json",
      },
      GlobalHotkeys: [{ Alt: false, Control: false, EGlobalHotkey: 0, KeyCode: null, Shift: false }],
      UIItem: { CurrentLanguage: "en", CurrentTheme: "Light" } as AppConfig_Serialize["UIItem"],
    });
    const latestConfig = makeConfig({
      ConstItem: {
        GeoSourceUrl: "https://current.example/geo.json",
        RouteRulesTemplateSourceUrl: "https://current.example/routes.json",
        SrsSourceUrl: "https://current.example/srs.json",
      },
      GlobalHotkeys: [{ Alt: true, Control: true, EGlobalHotkey: 0, KeyCode: 65, Shift: false }],
      UIItem: { CurrentLanguage: "fa", CurrentTheme: "Dark" } as AppConfig_Serialize["UIItem"],
    });

    ipcMocks.loadAppConfig.mockResolvedValueOnce(initialConfig).mockResolvedValueOnce(latestConfig);
    ipcMocks.saveAppConfig.mockImplementation(async (config: AppConfig_Serialize) => config);

    render(<CoreHarness />);

    const userAgent = await screen.findByDisplayValue("agent-before-edit");
    await user.clear(userAgent);
    await user.type(userAgent, "agent-after-edit");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(ipcMocks.saveAppConfig).toHaveBeenCalledTimes(1));

    expect(ipcMocks.loadAppConfig).toHaveBeenCalledTimes(2);
    expect(ipcMocks.saveAppConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        ConstItem: expect.objectContaining({
          GeoSourceUrl: "https://current.example/geo.json",
          RouteRulesTemplateSourceUrl: "https://current.example/routes.json",
          SrsSourceUrl: "https://current.example/srs.json",
        }),
        CoreBasicItem: expect.objectContaining({
          DefUserAgent: "agent-after-edit",
        }),
        GlobalHotkeys: [{ Alt: true, Control: true, EGlobalHotkey: 0, KeyCode: 65, Shift: false }],
        UIItem: { CurrentLanguage: "fa", CurrentTheme: "Dark" },
      }),
    );
  });

  it("labels core fields with translated text instead of raw config keys", async () => {
    ipcMocks.loadAppConfig.mockResolvedValue(makeConfig({}));

    render(<CoreHarness />);

    expect(await screen.findByRole("checkbox", { name: "Enable Log" })).toBeInTheDocument();
    expect(screen.getByLabelText("User-Agent")).toBeInTheDocument();
    expect(screen.queryByText("CoreBasic.LogEnabled")).not.toBeInTheDocument();
  });

  it("keeps sing-box controls while omitting Xray-only Mux and fragment details", async () => {
    ipcMocks.loadAppConfig.mockResolvedValue(makeConfig({}));

    const { container } = render(<CoreHarness />);

    expect(await screen.findByRole("checkbox", { name: /Enable fragment/i })).toBeInTheDocument();
    expect(container.querySelector("#rt-mux-sbox-max-connections")).toBeInTheDocument();
    expect(container.querySelector("#rt-mux-concurrency")).not.toBeInTheDocument();
    expect(container.querySelector("#rt-fragment-packets")).not.toBeInTheDocument();
  });

  it("no longer exposes update preferences on the tests tab", async () => {
    ipcMocks.loadAppConfig.mockResolvedValue(makeConfig({}));

    render(<TestsHarness />);

    expect(await screen.findByLabelText("Speed Test URL")).toBeInTheDocument();
    expect(screen.queryByText(/Update\.CheckPreRelease/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Update\.SelectedTargets/)).not.toBeInTheDocument();
  });

  it("omits client CDN settings while retaining subscription conversion", async () => {
    ipcMocks.loadAppConfig.mockResolvedValue(makeConfig({}));

    const { container } = render(<TestsHarness />);

    expect(await screen.findByLabelText("Subscription conversion URL")).toBeInTheDocument();
    expect(container.querySelector("#rt-cdn-base-url")).not.toBeInTheDocument();
    expect(container.querySelector("#rt-cdn-release-index-url")).not.toBeInTheDocument();
    expect(container.querySelector("#rt-cdn-core-manifest-url")).not.toBeInTheDocument();
  });
});

function makeConfig(overrides: Partial<AppConfig_Serialize>): AppConfig_Serialize {
  return {
    CoreBasicItem: {
      DefUserAgent: "agent-before-edit",
    },
    ...overrides,
  } as AppConfig_Serialize;
}
