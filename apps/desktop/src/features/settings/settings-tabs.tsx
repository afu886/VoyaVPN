import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";

import { TabsList, TabsTrigger } from "@voya/ui/components/tabs";
import { cn } from "@voya/ui/lib/utils";

// macOS-toolbar-style preference tabs: icon above an 11px label, the active
// tab filled with a neutral overlay tint (never the blue accent — that stays
// reserved for pressed option buttons inside the panes).
export function SettingsTabBar({ className, ...props }: ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      className={cn(
        "h-auto w-full flex-wrap justify-center gap-1 rounded-none border-b bg-surface-sunken px-12 py-2",
        className,
      )}
      {...props}
    />
  );
}

export function SettingsTabTrigger({
  className,
  icon: Icon,
  label,
  ...props
}: Omit<ComponentProps<typeof TabsTrigger>, "children"> & {
  icon: LucideIcon;
  label: string;
}) {
  return (
    <TabsTrigger
      className={cn(
        "h-auto flex-none flex-col gap-1 rounded-md border-transparent px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-none data-[state=active]:bg-overlay-hovered data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:border-transparent dark:data-[state=active]:bg-overlay-hovered",
        className,
      )}
      {...props}
    >
      <Icon className="size-5" aria-hidden="true" />
      {label}
    </TabsTrigger>
  );
}
