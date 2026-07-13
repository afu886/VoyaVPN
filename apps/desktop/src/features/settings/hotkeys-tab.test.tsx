import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HotkeysTab } from "@/features/settings/hotkeys-tab";
import { changeLocale } from "@voya/i18n";
import type { HotkeyStatus_Serialize } from "@/ipc/bindings";

const ipcMocks = vi.hoisted(() => ({
  globalHotkeyStatus: vi.fn(),
  saveGlobalHotkeys: vi.fn(),
}));

vi.mock("@/ipc", () => ipcMocks);

describe("HotkeysTab", () => {
  beforeEach(async () => {
    cleanup();
    vi.clearAllMocks();
    await changeLocale("en");
    ipcMocks.globalHotkeyStatus.mockResolvedValue(makeStatus());
    ipcMocks.saveGlobalHotkeys.mockImplementation(async (settings) => ({
      actions: makeStatus().actions,
      registered: [],
      settings,
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it("records a key, saves it, and reports the registration count", async () => {
    const user = userEvent.setup();

    render(<HotkeysTab />);

    const capture = await screen.findByRole("textbox", { name: "Hotkey key" });
    fireEvent.keyDown(capture, { key: "a", keyCode: 65 });
    expect(capture).toHaveValue("A");

    await user.click(screen.getByRole("button", { name: "Ctrl" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(ipcMocks.saveGlobalHotkeys).toHaveBeenCalledWith([
        { Alt: false, Control: true, EGlobalHotkey: 0, KeyCode: 65, Shift: false },
      ]),
    );
  });

  it("swallows Escape while recording instead of letting it bubble to the dialog", async () => {
    render(<HotkeysTab />);

    const capture = await screen.findByRole("textbox", { name: "Hotkey key" });
    const escape = fireEvent.keyDown(capture, { key: "Escape", keyCode: 27 });

    // fireEvent returns false when the event had preventDefault called.
    expect(escape).toBe(false);
    expect(capture).toHaveValue("Esc");
  });
});

function makeStatus(): HotkeyStatus_Serialize {
  return {
    actions: [{ action: 0, label: "Show window" }],
    registered: [],
    settings: [{ Alt: false, Control: false, EGlobalHotkey: 0, KeyCode: null, Shift: false }],
  };
}
