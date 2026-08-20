import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardPaste, FileUp, ImagePlus, Monitor, ScanLine, Upload } from "lucide-react";

import { useI18n } from "@voya/i18n/use-i18n";
import { Alert, AlertDescription } from "@voya/ui/components/alert";
import { Button } from "@voya/ui/components/button";
import { Card, CardContent } from "@voya/ui/components/card";
import { Checkbox } from "@voya/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@voya/ui/components/dialog";
import { Label } from "@voya/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@voya/ui/components/select";
import { Textarea } from "@voya/ui/components/textarea";
import { getErrorMessage } from "@voya/utils/error";
import { redactOperationalError } from "@voya/utils/operational-redaction";
import { importProfilesFromText, listSubscriptions, scanScreenQr } from "@/ipc";
import type { ImportProfilesResult } from "@/ipc/bindings";

type ImportProfilesDialogProps = {
  onImported: (result: ImportProfilesResult) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const EMPTY_SELECT_VALUE = "__voyavpn_manual_import__";

type ResultMessage = {
  id: string;
  text: string;
};

export function ImportProfilesDialog({ onImported, onOpenChange, open }: ImportProfilesDialogProps) {
  const { t } = useI18n();
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultMessages, setResultMessages] = useState<ResultMessage[]>([]);
  const [resultText, setResultText] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedSubid, setSelectedSubid] = useState("");
  const [text, setText] = useState("");
  const nextResultMessageIdRef = useRef(0);
  const subscriptionsQuery = useQuery({
    enabled: open,
    queryFn: listSubscriptions,
    queryKey: ["subscriptions"],
  });
  const subscriptions = useMemo(() => subscriptionsQuery.data ?? [], [subscriptionsQuery.data]);
  const canImport = text.trim().length > 0;
  const targetLabel = useMemo(() => {
    const selected = subscriptions.find((item) => item.Id === selectedSubid);

    return selected ? selected.Remarks : "Manual import";
  }, [selectedSubid, subscriptions]);

  async function handleImport() {
    if (!canImport) {
      return;
    }
    setError(null);
    setResultMessages([]);
    setResultText(null);
    try {
      const result = await importProfilesFromText(text, selectedSubid || null, Boolean(selectedSubid));
      setResultText(formatImportResult(result, targetLabel));
      setResultMessages(
        (result.messages ?? []).map((message) => ({
          id: `import-message-${++nextResultMessageIdRef.current}`,
          text: message,
        })),
      );
      setText("");
      await onImported(result);
      if ((result.imported ?? 0) > 0) {
        onOpenChange(false);
      }
    } catch (error) {
      setError(redactOperationalError(error));
    }
  }

  async function handlePaste() {
    if (!navigator.clipboard?.readText) {
      setError(t("qr.clipboardUnavailable"));
      return;
    }
    clearFeedback();
    try {
      setText(await navigator.clipboard.readText());
    } catch (error) {
      setError(redactOperationalError(error));
    }
  }

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }
    clearFeedback();
    try {
      setText(await file.text());
    } catch (error) {
      setError(redactOperationalError(error));
    }
  }

  async function handleQrFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    await scanIntoPayload(async () => {
      const { scanQrBlob } = await import("./qr-scanner");
      return scanQrBlob(file);
    });
  }

  async function handleClipboardImage() {
    if (!navigator.clipboard?.read) {
      setError(t("qr.clipboardImageUnavailable"));
      return;
    }

    await scanIntoPayload(async () => {
      const { readClipboardImageBlob, scanQrBlob } = await import("./qr-scanner");
      return scanQrBlob(await readClipboardImageBlob());
    });
  }

  async function handleScreenScan() {
    setScanning(true);
    clearFeedback();
    try {
      const result = await scanScreenQr();
      if (result.status === "found" && result.text?.trim()) {
        applyScannedPayload(result.text);
        return;
      }

      try {
        const { scanDisplayMediaQr } = await import("./qr-scanner");
        applyScannedPayload(await scanDisplayMediaQr());
      } catch (fallbackError) {
        const backendMessage =
          result.message?.trim() ||
          t(result.status === "unavailable" ? "qr.screenUnavailable" : "qr.noQrFound");
        const fallbackMessage = formatQrError(fallbackError);
        setError(
          fallbackMessage === backendMessage ? backendMessage : `${backendMessage} ${fallbackMessage}`,
        );
      }
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setScanning(false);
    }
  }

  async function scanIntoPayload(scan: () => Promise<string>) {
    setScanning(true);
    clearFeedback();
    try {
      applyScannedPayload(await scan());
    } catch (error) {
      setError(formatQrError(error));
    } finally {
      setScanning(false);
    }
  }

  function applyScannedPayload(payload: string) {
    const decoded = payload.trim();
    if (!decoded) {
      setError(t("qr.noQrFound"));
      return;
    }

    setText(decoded);
  }

  function clearFeedback() {
    setError(null);
    setResultMessages([]);
    setResultText(null);
  }

  function formatQrError(error: unknown) {
    return error instanceof Error && error.name === "QrNotFoundError"
      ? t("qr.noQrFound")
      : getErrorMessage(error);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4" aria-hidden="true" />
            Import Profiles
          </DialogTitle>
          <DialogDescription className="sr-only">
            Import share links, subscription URLs, or JSON payloads.
          </DialogDescription>
        </DialogHeader>

        <Card className="gap-3 rounded-xl bg-surface-raised p-3 shadow-raised">
          <CardContent className="grid gap-3 p-0">
            <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_auto_auto] md:items-end">
              <div className="grid min-w-0 gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="import-target">
                  Target
                </Label>
                <Select
                  onValueChange={(value) => setSelectedSubid(decodeSelectValue(value))}
                  value={encodeSelectValue(selectedSubid)}
                >
                  <SelectTrigger className="w-full bg-card" id="import-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>Manual import</SelectItem>
                    {subscriptions.map((item) => (
                      <SelectItem key={item.Id} value={item.Id}>
                        {item.Remarks || item.Url}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid min-w-0 gap-1">
                <Label className="text-xs text-muted-foreground" htmlFor="import-subscription-target">
                  Mode
                </Label>
                <div className="flex h-9 items-center rounded-md border bg-card px-3 shadow-xs">
                  <Label
                    className="h-full min-w-0 cursor-pointer text-xs font-medium text-muted-foreground"
                    htmlFor="import-subscription-target"
                  >
                    <Checkbox
                      checked={Boolean(selectedSubid)}
                      disabled={subscriptions.length === 0}
                      id="import-subscription-target"
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          setSelectedSubid((current) => current || subscriptions[0]?.Id || "");
                          return;
                        }

                        setSelectedSubid("");
                      }}
                    />
                    <span className="truncate">Subscription target</span>
                  </Label>
                </div>
              </div>

              <Button disabled={scanning} onClick={() => void handlePaste()} type="button" variant="outline">
                <ClipboardPaste className="size-4" aria-hidden="true" />
                Paste
              </Button>

              <Button asChild variant="outline">
                <Label className="cursor-pointer" htmlFor="import-payload-file">
                  <FileUp className="size-4" aria-hidden="true" />
                  File
                </Label>
              </Button>
              <input
                aria-label="Import payload file"
                className="sr-only"
                id="import-payload-file"
                onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
                type="file"
              />
            </div>

            <section className="grid gap-2" aria-label={t("qr.scan")}>
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <ScanLine className="size-4" aria-hidden="true" />
                {t("qr.scan")}
              </h3>
              <input
                ref={qrFileInputRef}
                accept="image/*"
                aria-label={t("qr.scanImage")}
                className="hidden"
                onChange={(event) => void handleQrFile(event)}
                type="file"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={scanning}
                  onClick={() => qrFileInputRef.current?.click()}
                  type="button"
                  variant="outline"
                >
                  <ImagePlus className="size-4" aria-hidden="true" />
                  {t("qr.scanImage")}
                </Button>
                <Button
                  disabled={scanning}
                  onClick={() => void handleClipboardImage()}
                  type="button"
                  variant="outline"
                >
                  <ClipboardPaste className="size-4" aria-hidden="true" />
                  {t("qr.scanClipboardImage")}
                </Button>
                <Button
                  disabled={scanning}
                  onClick={() => void handleScreenScan()}
                  type="button"
                  variant="outline"
                >
                  <Monitor className="size-4" aria-hidden="true" />
                  {t("qr.scanScreen")}
                </Button>
              </div>
            </section>

            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground" htmlFor="import-payload">
                Import payload
              </Label>
              <Textarea
                className="min-h-72 resize-y bg-card font-mono text-xs"
                id="import-payload"
                onChange={(event) => {
                  setResultMessages([]);
                  setResultText(null);
                  setText(event.target.value);
                }}
                value={text}
              />
            </div>

            {resultText ? (
              <Alert role="status">
                <AlertDescription>
                  <div>{resultText}</div>
                  {resultMessages.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 ps-5">
                      {resultMessages.map((message) => (
                        <li key={message.id}>{message.text}</li>
                      ))}
                    </ul>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Close
          </Button>
          <Button disabled={!canImport || scanning} onClick={() => void handleImport()} type="button">
            Import payload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function encodeSelectValue(value: string) {
  return value === "" ? EMPTY_SELECT_VALUE : value;
}

function decodeSelectValue(value: string) {
  return value === EMPTY_SELECT_VALUE ? "" : value;
}

function formatImportResult(result: ImportProfilesResult, targetLabel: string) {
  const imported = result.imported ?? 0;
  const updated = result.updated ?? 0;
  const skipped = result.skipped ?? 0;
  const details = [`${imported} imported`, `${skipped} skipped`];
  const parsed = result.parsed ?? null;
  const filtered = result.filtered ?? 0;
  const deduped = result.deduped ?? 0;
  const failed = result.failed ?? 0;
  const removedDuplicates = result.removedDuplicates ?? 0;

  if (updated > 0) {
    details.push(`${updated} updated`);
  }
  if (removedDuplicates > 0) {
    details.push(`${removedDuplicates} duplicates removed`);
  }
  if (parsed !== null) {
    details.push(`${parsed} parsed`);
  }
  if (filtered > 0) {
    details.push(`${filtered} filtered`);
  }
  if (deduped > 0) {
    details.push(`${deduped} payload duplicate`);
  }
  if (failed > 0) {
    details.push(`${failed} failed`);
  }

  return `${details.join(", ")} for ${targetLabel}.`;
}
