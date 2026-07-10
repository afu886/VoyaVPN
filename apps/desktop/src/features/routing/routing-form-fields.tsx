import { useId } from "react";

import { Checkbox } from "@voya/ui/components/checkbox";
import { Input } from "@voya/ui/components/input";
import { Label } from "@voya/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voya/ui/components/select";
import { Textarea } from "@voya/ui/components/textarea";

type SelectOption = {
  label: string;
  value: string;
};

const EMPTY_SELECT_VALUE = "__voyavpn_empty_select_value__";

export function TextField({
  error,
  label,
  onChange,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {error ? (
        <span className="text-xs text-destructive" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function SelectField({
  error,
  label,
  onChange,
  options,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  value: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const selectValue = value === "" ? EMPTY_SELECT_VALUE : value;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        onValueChange={(nextValue) => onChange(nextValue === EMPTY_SELECT_VALUE ? "" : nextValue)}
        value={selectValue}
      >
        <SelectTrigger
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? true : undefined}
          className="w-full"
          id={id}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value || EMPTY_SELECT_VALUE}
              value={option.value === "" ? EMPTY_SELECT_VALUE : option.value}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <span className="text-xs text-destructive" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function TextAreaField({
  error,
  label,
  onChange,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        className="min-h-24 resize-y"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      {error ? (
        <span className="text-xs text-destructive" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function CheckboxField({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}
