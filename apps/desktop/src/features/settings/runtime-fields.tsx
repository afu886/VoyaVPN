import type { ReactNode } from "react";

import { Input } from "@voya/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voya/ui/components/select";

import { SettingsCheckbox, SettingsRow } from "./settings-form";

export function CheckboxField({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean;
  description?: ReactNode;
  label: ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <SettingsCheckbox
      checked={checked}
      description={description}
      label={label}
      onCheckedChange={(state) => onChange(state === true)}
    />
  );
}

export function TextField({
  description,
  id,
  label,
  onChange,
  value,
}: {
  description?: ReactNode;
  id: string;
  label: ReactNode;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <SettingsRow description={description} htmlFor={id} label={label}>
      <Input
        className="h-8 w-full max-w-md"
        id={id}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
    </SettingsRow>
  );
}

export function NumberField({
  description,
  id,
  label,
  onChange,
  value,
}: {
  description?: ReactNode;
  id: string;
  label: ReactNode;
  onChange: (value: number | null) => void;
  value: number | null;
}) {
  return (
    <SettingsRow description={description} htmlFor={id} label={label}>
      <Input
        className="h-8 w-40"
        id={id}
        onChange={(event) => {
          const text = event.currentTarget.value.trim();
          onChange(text ? Number(text) : null);
        }}
        type="number"
        value={value ?? ""}
      />
    </SettingsRow>
  );
}

export function SelectField({
  description,
  id,
  label,
  onChange,
  optionLabel = (value) => value,
  options,
  value,
}: {
  description?: ReactNode;
  id: string;
  label: ReactNode;
  onChange: (value: string) => void;
  optionLabel?: (value: string) => string;
  options: string[];
  value: string;
}) {
  return (
    <SettingsRow description={description} htmlFor={id} label={label}>
      <Select onValueChange={onChange} value={value}>
        <SelectTrigger className="h-8 w-fit min-w-44" id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}
