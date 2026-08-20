import { redactOperationalMessage } from "@voya/utils/operational-redaction";
import type { TranslationFunction } from "@voya/i18n";

export function redactUpdateMessage(message: string, t: TranslationFunction) {
  return redactOperationalMessage(message, {
    redactedUrl: t("updates.redactedUrl"),
    redactedValue: t("updates.redactedValue"),
  });
}
