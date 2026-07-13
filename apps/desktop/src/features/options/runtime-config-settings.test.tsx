import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { changeLocale } from "@voya/i18n";
import { RuntimeConfigSettings } from "@/features/options/runtime-config-settings";
import type { AppConfig_Serialize } from "@/ipc/bindings";

const ipcMocks = vi.hoisted(() => ({
  loadAppConfig: vi.fn(),
  saveAppConfig: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);

describe("RuntimeConfigSettings", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
  });

  afterEach(() => {
    cleanup();
  });

  it("preserves the latest config sources when saving another runtime setting", async () => {
    const user = userEvent.setup();
    const initialConfig = makeConfig({
      GeoSourceUrl: "https://old.example/geo.json",
      RouteRulesTemplateSourceUrl: "https://old.example/routes.json",
      SrsSourceUrl: "https://old.example/srs.json",
    });
    const latestConfig = makeConfig({
      GeoSourceUrl: "https://current.example/geo.json",
      RouteRulesTemplateSourceUrl: "https://current.example/routes.json",
      SrsSourceUrl: "https://current.example/srs.json",
    });

    ipcMocks.loadAppConfig.mockResolvedValueOnce(initialConfig).mockResolvedValueOnce(latestConfig);
    ipcMocks.saveAppConfig.mockImplementation(async (config: AppConfig_Serialize) => config);

    render(<RuntimeConfigSettings />);

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
      }),
    );
  });
});

function makeConfig(sources: AppConfig_Serialize["ConstItem"]): AppConfig_Serialize {
  return {
    ConstItem: sources,
    CoreBasicItem: {
      DefUserAgent: "agent-before-edit",
    },
  } as AppConfig_Serialize;
}
