import { Moon, QrCode, Settings, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@voya/ui/components/button";
import { useI18n } from "@voya/i18n/use-i18n";
import { useModalStore } from "@/stores/modal-store";
import { resolveThemeMode, type ThemeMode, usePreferencesStore } from "@/stores/preferences-store";

// The former Menubar Tools/Help actions now live as a row of icon actions pinned
// to the bottom of the sidebar: the QR action, a one-tap theme toggle, and the
// Settings entry (check-updates lives on the Settings dialog's Updates tab).
export function SidebarFooter() {
  const { t } = useI18n();
  const openModal = useModalStore((state) => state.openModal);
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode);
  const themeMode = usePreferencesStore((state) => state.themeMode);
  const resolvedTheme = resolveThemeMode(themeMode);
  const nextThemeMode: ThemeMode = resolvedTheme === "dark" ? "light" : "dark";
  const ThemeIcon = resolvedTheme === "dark" ? Sun : Moon;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-t border-sidebar-border px-2 py-2">
      <SidebarFooterAction icon={QrCode} label={t("menu.qr")} onClick={() => openModal("qr")} />
      <SidebarFooterAction
        icon={ThemeIcon}
        label={t("menu.theme")}
        onClick={() => setThemeMode(nextThemeMode)}
      />
      <SidebarFooterAction
        icon={Settings}
        label={t("actions.settings")}
        onClick={() => openModal("settings")}
      />
    </div>
  );
}

function SidebarFooterAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className="text-subtle"
      onClick={onClick}
      size="icon-sm"
      title={label}
      type="button"
      variant="ghost"
    >
      <Icon className="size-4" aria-hidden="true" />
    </Button>
  );
}
