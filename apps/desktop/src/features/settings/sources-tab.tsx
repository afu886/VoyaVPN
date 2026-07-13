import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileJson2, Save } from "lucide-react";

import { Alert, AlertDescription } from "@voya/ui/components/alert";
import { Button } from "@voya/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voya/ui/components/dialog";
import { Input } from "@voya/ui/components/input";
import { Separator } from "@voya/ui/components/separator";
import { cn } from "@voya/ui/lib/utils";
import { useI18n } from "@voya/i18n/use-i18n";
import { importConfigTemplate, loadConfigSources, saveConfigSources } from "@/ipc";
import type { ConfigSourceSettings, ConfigTemplateSelection } from "@/ipc/bindings";
import { useModalStore } from "@/stores/modal-store";
import { useToastStore } from "@/stores/toast-store";
import { useMountedRef } from "@voya/utils/use-mounted-ref";
import { getErrorMessage } from "@voya/utils/error";

import { SettingsGroup, SettingsRow } from "./settings-form";

type SourceForm = {
  geoSourceUrl: string;
  routeRulesTemplateSourceUrl: string;
  srsSourceUrl: string;
};

type TemplateType = "default" | "russia" | "iran" | "custom";

const emptyForm: SourceForm = {
  geoSourceUrl: "",
  routeRulesTemplateSourceUrl: "",
  srsSourceUrl: "",
};

const templateOptions: Array<{
  descriptionKey: string;
  labelKey: string;
  type: TemplateType;
}> = [
  {
    descriptionKey: "options.configTemplate.defaultDescription",
    labelKey: "options.configTemplate.default",
    type: "default",
  },
  {
    descriptionKey: "options.configTemplate.russiaDescription",
    labelKey: "options.configTemplate.russia",
    type: "russia",
  },
  {
    descriptionKey: "options.configTemplate.iranDescription",
    labelKey: "options.configTemplate.iran",
    type: "iran",
  },
  {
    descriptionKey: "options.configTemplate.customDescription",
    labelKey: "options.configTemplate.custom",
    type: "custom",
  },
];

export function SourcesTab() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const openModal = useModalStore((state) => state.openModal);
  const pushToast = useToastStore((state) => state.pushToast);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<SourceForm>(emptyForm);
  const [importError, setImportError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importWorking, setImportWorking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType | null>(null);
  const [working, setWorking] = useState(true);
  const loadGenerationRef = useRef(0);
  const mountedRef = useMountedRef();

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    const isCurrent = () => mountedRef.current && generation === loadGenerationRef.current;

    void loadConfigSources()
      .then((settings) => {
        if (!isCurrent()) {
          return;
        }
        setForm(toSourceForm(settings));
      })
      .catch((error: unknown) => {
        if (isCurrent()) {
          setError(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (isCurrent()) {
          setWorking(false);
        }
      });

    return () => {
      loadGenerationRef.current += 1;
    };
  }, [mountedRef]);

  function patchForm(patch: Partial<SourceForm>) {
    setSaved(false);
    setForm((current) => ({ ...current, ...patch }));
  }

  async function save() {
    setWorking(true);
    setError(null);
    setSaved(false);
    try {
      const settings = await saveConfigSources(toSourceSettings(form));
      setForm(toSourceForm(settings));
      setSaved(true);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  function openImportDialog() {
    setImportError(null);
    setSelectedTemplate(null);
    setImportOpen(true);
  }

  function handleImportOpenChange(open: boolean) {
    if (importWorking) {
      return;
    }

    setImportOpen(open);
    if (!open) {
      setImportError(null);
      setSelectedTemplate(null);
    }
  }

  async function applyTemplate() {
    if (!selectedTemplate) {
      return;
    }

    if (selectedTemplate === "custom") {
      const validationError = validateCustomSources(form);
      if (validationError) {
        setImportError(t(validationError));
        return;
      }
    }

    const selection: ConfigTemplateSelection =
      selectedTemplate === "custom"
        ? { sources: toSourceSettings(form), type: "custom" }
        : { type: selectedTemplate };
    const isRegionalTemplate = selectedTemplate === "russia" || selectedTemplate === "iran";

    setImportWorking(true);
    setImportError(null);
    try {
      const result = await importConfigTemplate(selection);
      setForm(toSourceForm(result.sources));
      setSaved(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["app-config"] }),
        queryClient.invalidateQueries({ queryKey: ["dns"] }),
        queryClient.invalidateQueries({ queryKey: ["routings"] }),
      ]);

      const descriptions = [t("options.configTemplate.appliedDescription")];
      if (result.reusedExistingRouting) {
        descriptions.push(t("options.configTemplate.reusedDescription"));
      }
      if (
        isRegionalTemplate &&
        (!result.singboxDnsFetched || !result.simpleDnsFetched || result.fallbackCustomDnsEnabled)
      ) {
        descriptions.push(t("options.configTemplate.dnsFallbackWarning"));
      }
      pushToast({
        description: descriptions.join(" "),
        title: t("options.configTemplate.applied"),
      });
      setImportOpen(false);
      setSelectedTemplate(null);
    } catch (error) {
      setImportError(getErrorMessage(error));
    } finally {
      setImportWorking(false);
    }
  }

  return (
    <div className="grid gap-4">
      <SettingsGroup>
        <SourceField
          disabled={working}
          id="ruleset-geo-source-url"
          label={t("options.geoSource")}
          onChange={(geoSourceUrl) => patchForm({ geoSourceUrl })}
          value={form.geoSourceUrl}
        />
        <SourceField
          disabled={working}
          id="ruleset-srs-source-url"
          label={t("options.srsSource")}
          onChange={(srsSourceUrl) => patchForm({ srsSourceUrl })}
          value={form.srsSourceUrl}
        />
        <SourceField
          disabled={working}
          id="routing-template-source-url"
          label={t("options.routeTemplateSource")}
          onChange={(routeRulesTemplateSourceUrl) => patchForm({ routeRulesTemplateSourceUrl })}
          value={form.routeRulesTemplateSourceUrl}
        />

        <SettingsRow>
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={working} onClick={() => void save()} size="sm" type="button" variant="outline">
              <Save className="size-4" aria-hidden="true" />
              {t("actions.save")}
            </Button>
            <Button disabled={working} onClick={openImportDialog} size="sm" type="button" variant="outline">
              <Download className="size-4" aria-hidden="true" />
              {t("options.configTemplate.import")}
            </Button>
            {saved ? <span className="text-xs text-muted-foreground">{t("options.saved")}</span> : null}
            {error ? <span className="text-xs text-destructive">{error}</span> : null}
          </div>
          <p className="text-xs text-muted-foreground">{t("options.configTemplate.description")}</p>
        </SettingsRow>
      </SettingsGroup>

      <Separator />

      <SettingsGroup>
        <SettingsRow label={t("templates.title")}>
          <Button
            onClick={() => openModal("fullConfigTemplate")}
            size="sm"
            type="button"
            variant="outline"
          >
            <FileJson2 className="size-4" aria-hidden="true" />
            {t("templates.open")}
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <Dialog open={importOpen} onOpenChange={handleImportOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="size-4" aria-hidden="true" />
              {t("options.configTemplate.title")}
            </DialogTitle>
            <DialogDescription>{t("options.configTemplate.selectPrompt")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 px-6 py-4">
            <p className="text-sm text-muted-foreground">{t("options.configTemplate.advancedHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {templateOptions.map((option) => {
                const selected = selectedTemplate === option.type;

                return (
                  <Button
                    key={option.type}
                    aria-pressed={selected}
                    className={cn(
                      "h-auto min-h-20 min-w-0 items-start justify-start whitespace-normal px-3 py-3 text-start",
                      selected && "border-primary bg-accent-blue-light text-brand hover:bg-accent-blue-light",
                    )}
                    disabled={importWorking}
                    onClick={() => {
                      setImportError(null);
                      setSelectedTemplate(option.type);
                    }}
                    type="button"
                    variant="outline"
                  >
                    <span className="grid min-w-0 gap-1">
                      <span className="font-medium">{t(option.labelKey)}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {t(option.descriptionKey)}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>

            {importError ? (
              <Alert variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              disabled={importWorking}
              onClick={() => handleImportOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("actions.close")}
            </Button>
            <Button
              disabled={!selectedTemplate || importWorking}
              onClick={() => void applyTemplate()}
              type="button"
            >
              {importWorking ? t("options.configTemplate.applying") : t("options.configTemplate.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SourceField({
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  disabled: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <SettingsRow htmlFor={id} label={label}>
      <Input
        className="h-8 w-full max-w-md"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      />
    </SettingsRow>
  );
}

function toSourceForm(settings: ConfigSourceSettings): SourceForm {
  return {
    geoSourceUrl: settings.geoSourceUrl ?? "",
    routeRulesTemplateSourceUrl: settings.routeRulesTemplateSourceUrl ?? "",
    srsSourceUrl: settings.srsSourceUrl ?? "",
  };
}

function toSourceSettings(form: SourceForm): ConfigSourceSettings {
  return {
    geoSourceUrl: form.geoSourceUrl.trim() || null,
    routeRulesTemplateSourceUrl: form.routeRulesTemplateSourceUrl.trim() || null,
    srsSourceUrl: form.srsSourceUrl.trim() || null,
  };
}

function validateCustomSources(form: SourceForm) {
  const sources = [form.geoSourceUrl, form.srsSourceUrl, form.routeRulesTemplateSourceUrl];
  if (!form.routeRulesTemplateSourceUrl.trim()) {
    return "options.configTemplate.customSourcesRequired";
  }

  for (const source of sources) {
    if (!source.trim()) {
      continue;
    }

    try {
      const parsed = new URL(source.trim());
      if (
        parsed.protocol !== "https:" ||
        !parsed.hostname ||
        parsed.username.length > 0 ||
        parsed.password.length > 0
      ) {
        return "options.configTemplate.invalidSourceUrl";
      }
    } catch {
      return "options.configTemplate.invalidSourceUrl";
    }
  }

  return null;
}
