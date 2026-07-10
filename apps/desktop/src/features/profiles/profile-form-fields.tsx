import { useId } from "react";
import type * as React from "react";
import { Controller } from "react-hook-form";
import type { Control, FieldPath, UseFormRegister } from "react-hook-form";

import { Badge } from "@voya/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@voya/ui/components/card";
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
import { Switch } from "@voya/ui/components/switch";
import { cn } from "@voya/ui/lib/utils";
import { useI18n } from "@voya/i18n/use-i18n";
import { ShieldCheck } from "lucide-react";

import type { ParsedProfileFormValues, ProfileFormValues } from "./profile-form-schema";

export type Register = UseFormRegister<ProfileFormValues>;
export type ProfileFormControl = Control<ProfileFormValues, unknown, ParsedProfileFormValues>;

export function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Card className="gap-3 rounded-xl bg-surface-raised p-3 shadow-raised">
      <CardHeader className="p-0">
        <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
  label: string;
};

export function TextField({ className, error, id, label, ...props }: TextFieldProps) {
  const inputId = id ?? fieldId(label);
  const errorId = `${inputId}-error`;
  const {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    ...inputProps
  } = props;

  return (
    <div className="grid min-w-0 gap-1">
      <Label className="text-xs text-muted-foreground" htmlFor={inputId}>
        <span className="truncate">{label}</span>
      </Label>
      <Input
        aria-describedby={error ? mergeIds(ariaDescribedBy, errorId) : ariaDescribedBy}
        aria-invalid={error ? true : ariaInvalid}
        className={cn("bg-card", className)}
        id={inputId}
        {...inputProps}
      />
      {error ? (
        <span className="text-xs text-destructive" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

type SelectOption = {
  description?: string;
  label: string;
  value: number | string;
};

type SelectFieldProps = {
  className?: string;
  control: ProfileFormControl;
  error?: string;
  id?: string;
  label: string;
  name: FieldPath<ProfileFormValues>;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  parseValue?: (value: string) => unknown;
};

export function SelectField({
  className,
  control,
  error,
  id,
  label,
  name,
  onValueChange,
  options,
  parseValue,
}: SelectFieldProps) {
  const inputId = id ?? fieldId(label);
  const errorId = `${inputId}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = Boolean(error ?? fieldState.error?.message);

        return (
          <div className="grid min-w-0 gap-1">
            <Label className="text-xs text-muted-foreground" htmlFor={inputId}>
              <span className="truncate">{label}</span>
            </Label>
            <Select
              name={field.name}
              onValueChange={(value) => {
                const decoded = decodeSelectValue(value);

                field.onChange(parseValue ? parseValue(decoded) : decoded);
                onValueChange?.(decoded);
              }}
              value={encodeSelectValue(field.value)}
            >
              <SelectTrigger
                aria-describedby={error ? errorId : undefined}
                aria-invalid={invalid ? true : undefined}
                className={cn("w-full bg-card", className)}
                id={inputId}
                onBlur={field.onBlur}
                ref={field.ref}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={`${name}-${option.value}`} value={encodeSelectValue(option.value)}>
                    <span>{option.label}</span>
                    {option.description ? <span className="sr-only">{option.description}</span> : null}
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
      }}
    />
  );
}

type CheckboxFieldProps = {
  className?: string;
  control: ProfileFormControl;
  id?: string;
  label: string;
  name: FieldPath<ProfileFormValues>;
};

export function CheckboxField({ className, control, id, label, name }: CheckboxFieldProps) {
  const inputId = id ?? fieldId(label);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Card className={cn("h-9 min-w-0 justify-center gap-0 rounded-md bg-card px-3 py-0 shadow-none", className)}>
          <Label
            className="h-full w-full min-w-0 cursor-pointer text-xs font-medium text-muted-foreground"
            htmlFor={inputId}
          >
            <Checkbox
              aria-invalid={fieldState.invalid ? true : undefined}
              checked={field.value === true}
              id={inputId}
              name={field.name}
              onBlur={field.onBlur}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              ref={field.ref}
            />
            <span className="truncate">{label}</span>
          </Label>
        </Card>
      )}
    />
  );
}

export function ToggleButton({
  checked,
  description,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  label: string;
  onCheckedChange: (enabled: boolean) => void;
}) {
  const { t } = useI18n();
  const generatedId = useId();
  const inputId = `${fieldId(label)}-${generatedId}`;

  return (
    <Card
      className={cn(
        "h-16 justify-center gap-0 rounded-md px-3 py-0 shadow-none transition-colors",
        checked ? "border-primary bg-accent/60" : "bg-card",
      )}
      title={description}
    >
      <Label className="h-full w-full min-w-0 cursor-pointer justify-between gap-3 text-xs" htmlFor={inputId}>
        <span className="grid min-w-0 gap-1">
          <span className="truncate font-medium text-foreground">{label}</span>
          <Badge className="w-fit" variant={checked ? "default" : "secondary"}>
            {checked ? t("panes.profiles.toggle.on") : t("panes.profiles.toggle.off")}
          </Badge>
        </span>
        <Switch aria-label={label} checked={checked} id={inputId} onCheckedChange={onCheckedChange} />
      </Label>
    </Card>
  );
}

function fieldId(label: string) {
  return label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "");
}

const EMPTY_SELECT_VALUE = "__voyavpn_empty__";

function encodeSelectValue(value: unknown) {
  const stringValue = value === null || value === undefined ? "" : String(value);

  return stringValue === "" ? EMPTY_SELECT_VALUE : stringValue;
}

function decodeSelectValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

function mergeIds(...ids: Array<string | undefined>) {
  return ids.filter(Boolean).join(" ") || undefined;
}
