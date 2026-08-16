import { redactOperationalMessage } from "@voya/utils/operational-redaction";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function redactUpdateMessage(message: string, t: Translate) {
  return redactOperationalMessage(message, {
    redactedUrl: t("updates.redactedUrl"),
    redactedValue: t("updates.redactedValue"),
  });
}
