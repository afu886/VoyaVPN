import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { IpcCommandError, loadDnsSettings, saveDnsSettings } from "@/ipc";
import type { DnsItem_Serialize, DnsSettings_Serialize } from "@/ipc/bindings";
import { getErrorMessage } from "@voya/utils/error";

import { dnsSettingsSchema, zodIssuesToErrorMap } from "./dns-form-schema";

type DnsCoreKey = "singboxDnsItem";

export function useDnsSettings() {
  const queryClient = useQueryClient();
  const dnsQuery = useQuery({
    queryFn: loadDnsSettings,
    queryKey: ["dns"],
  });
  const [draft, setDraft] = useState<DnsSettings_Serialize | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const form = draft ?? dnsQuery.data ?? null;

  const issueCount = Object.keys(fieldErrors).length;
  const isDirty = useMemo(() => {
    if (!form || !dnsQuery.data) {
      return false;
    }
    return draft !== null && JSON.stringify(draft) !== JSON.stringify(dnsQuery.data);
  }, [dnsQuery.data, draft, form]);

  async function handleReload() {
    setOperationError(null);
    setFieldErrors({});
    setDraft(null);
    await queryClient.invalidateQueries({ queryKey: ["dns"] });
  }

  async function handleSave() {
    if (!form) {
      return;
    }
    setOperationError(null);
    setFieldErrors({});
    try {
      const payload = dnsSettingsSchema.parse(form);
      const saved = await saveDnsSettings(payload);
      queryClient.setQueryData(["dns"], saved);
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["dns"] });
      await queryClient.invalidateQueries({ queryKey: ["app-config"] });
    } catch (error) {
      if (error instanceof z.ZodError) {
        setOperationError("DNS settings validation failed");
        setFieldErrors(zodIssuesToErrorMap(error));
        return;
      }
      if (error instanceof IpcCommandError && error.appError.kind === "dns") {
        setOperationError(error.appError.message.message);
        setFieldErrors(
          Object.fromEntries(error.appError.message.issues.map((issue) => [issue.field, issue.message])),
        );
        return;
      }
      setOperationError(getErrorMessage(error));
    }
  }

  function updateSimple(patch: Partial<DnsSettings_Serialize["simpleDnsItem"]>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            simpleDnsItem: {
              ...current.simpleDnsItem,
              ...patch,
            },
          }
        : dnsQuery.data
          ? {
              ...dnsQuery.data,
              simpleDnsItem: {
                ...dnsQuery.data.simpleDnsItem,
                ...patch,
              },
            }
          : current,
    );
  }

  function updateCore(core: DnsCoreKey, patch: Partial<DnsItem_Serialize>) {
    setDraft((current) =>
      current
        ? {
            ...current,
            [core]: {
              ...current[core],
              ...patch,
            },
          }
        : dnsQuery.data
          ? {
              ...dnsQuery.data,
              [core]: {
                ...dnsQuery.data[core],
                ...patch,
              },
            }
          : current,
    );
  }

  return {
    dnsQuery,
    fieldErrors,
    form,
    handleReload,
    handleSave,
    isDirty,
    issueCount,
    operationError,
    updateCore,
    updateSimple,
  };
}
