import type { ComponentProps, ReactNode } from "react";

import { Checkbox } from "@voya/ui/components/checkbox";
import { Label } from "@voya/ui/components/label";
import { cn } from "@voya/ui/lib/utils";

// macOS-preferences row grammar: a fixed label column keeps every control's
// leading edge aligned across rows and groups; logical properties only, so the
// column order mirrors automatically under RTL locales (fa).
const rowGrid = "grid grid-cols-[11rem_minmax(0,1fr)] gap-x-4";

export function SettingsGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("grid gap-3", className)}>{children}</section>;
}

export function SettingsRow({
  align = "center",
  children,
  className,
  description,
  htmlFor,
  label,
}: {
  align?: "center" | "start";
  children: ReactNode;
  className?: string;
  description?: ReactNode;
  htmlFor?: string;
  label?: ReactNode;
}) {
  return (
    <div className={cn(rowGrid, align === "center" ? "items-center" : "items-start", className)}>
      {label ? (
        <Label
          className={cn(
            "block justify-self-end text-end text-sm font-normal leading-5",
            align === "start" && "pt-1.5",
          )}
          htmlFor={htmlFor}
        >
          {label}
        </Label>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="grid min-w-0 justify-items-start gap-1.5">
        {children}
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  );
}

export function SettingsCheckboxGroup({
  children,
  className,
  id,
  label,
}: {
  children: ReactNode;
  className?: string;
  id: string;
  label: ReactNode;
}) {
  return (
    <div aria-labelledby={id} className={cn(rowGrid, "items-start", className)} role="group">
      <span className="justify-self-end pt-0.5 text-end text-sm leading-5" id={id}>
        {label}
      </span>
      <div className="grid min-w-0 justify-items-start gap-2">{children}</div>
    </div>
  );
}

export function SettingsCheckbox({
  description,
  label,
  ...props
}: Omit<ComponentProps<typeof Checkbox>, "children"> & {
  description?: ReactNode;
  label: ReactNode;
}) {
  return (
    <label className="flex min-w-0 cursor-pointer items-start gap-2 text-sm">
      <Checkbox className="mt-0.5 rounded-sm" {...props} />
      <span className="grid min-w-0 gap-0.5">
        <span className="leading-5">{label}</span>
        {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}
