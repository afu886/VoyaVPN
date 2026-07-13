import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Input } from "@voya/ui/components/input";
import {
  SettingsCheckbox,
  SettingsCheckboxGroup,
  SettingsRow,
} from "@/features/settings/settings-form";

describe("settings form primitives", () => {
  afterEach(() => {
    cleanup();
  });

  it("associates the row label with its control", () => {
    render(
      <SettingsRow htmlFor="row-input" label="Server address">
        <Input id="row-input" readOnly value="example.test" />
      </SettingsRow>,
    );

    expect(screen.getByLabelText("Server address")).toHaveValue("example.test");
  });

  it("exposes checkbox stacks as a labelled group", () => {
    render(
      <SettingsCheckboxGroup id="editor-group" label="Editor">
        <SettingsCheckbox checked={false} label="Hide Markdown" onCheckedChange={() => undefined} />
        <SettingsCheckbox checked label="Autocomplete tags" onCheckedChange={() => undefined} />
      </SettingsCheckboxGroup>,
    );

    const group = screen.getByRole("group", { name: "Editor" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hide Markdown" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Autocomplete tags" })).toBeChecked();
  });
});
