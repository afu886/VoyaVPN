import {
  exportProfileClientConfig,
  exportProfileVoyaBundle,
  exportProfileShareLinks,
  exportProfileShareLinksBase64,
} from "@/ipc";
import type { ExportProfilesResult, ImportProfilesResult } from "@/ipc/bindings";
import type { TranslateFn } from "./server-table-columns";

export type ProfileExportKind = "clientConfig" | "shareBase64" | "shareLinks" | "voyaBundle";

export function profilesQueryKey(filter: string) {
  return ["profiles", { filter }] as const;
}

export function runProfileExport(kind: ProfileExportKind, indexIds: string[]): Promise<ExportProfilesResult> {
  switch (kind) {
    case "clientConfig":
      return exportProfileClientConfig(indexIds);
    case "voyaBundle":
      return exportProfileVoyaBundle(indexIds);
    case "shareBase64":
      return exportProfileShareLinksBase64(indexIds);
    case "shareLinks":
      return exportProfileShareLinks(indexIds);
  }
}

export function exportFileName(kind: ProfileExportKind) {
  switch (kind) {
    case "clientConfig":
      return "voyavpn-client-config.json";
    case "voyaBundle":
      return "voyavpn-profile-bundle.voya";
    case "shareBase64":
      return "voyavpn-share-links-base64.txt";
    case "shareLinks":
      return "voyavpn-share-links.txt";
  }
}

export function exportFileFilter(kind: ProfileExportKind) {
  return kind === "clientConfig"
    ? { extensions: ["json"], name: "JSON" }
    : kind === "voyaBundle"
      ? { extensions: ["voya"], name: "Voya profile bundle" }
      : { extensions: ["txt"], name: "Text" };
}

export function formatImportOperationMessage(result: ImportProfilesResult, t: TranslateFn) {
  const imported = result.imported ?? 0;
  const updated = result.updated ?? 0;
  const skipped = result.skipped ?? 0;
  const failed = result.failed ?? 0;
  const filtered = result.filtered ?? 0;
  const deduped = result.deduped ?? 0;
  const removedDuplicates = result.removedDuplicates ?? 0;
  const discardedNodeOverrides = result.discardedNodeOverrides ?? 0;
  const parts = [`Imported ${imported.toLocaleString()} profile${imported === 1 ? "" : "s"}.`];

  if (updated > 0) {
    parts.push(`${updated.toLocaleString()} updated.`);
  }
  if (removedDuplicates > 0) {
    parts.push(
      `${removedDuplicates.toLocaleString()} duplicate${removedDuplicates === 1 ? "" : "s"} removed.`,
    );
  }
  if (skipped > 0) {
    parts.push(`${skipped.toLocaleString()} skipped.`);
  }
  if (failed > 0) {
    parts.push(`${failed.toLocaleString()} failed to parse.`);
  }
  if (filtered > 0) {
    parts.push(`${filtered.toLocaleString()} filtered.`);
  }
  if (deduped > 0) {
    parts.push(`${deduped.toLocaleString()} duplicate${deduped === 1 ? "" : "s"} skipped from payload.`);
  }
  if (discardedNodeOverrides > 0) {
    parts.push(
      t("panes.profiles.import.discardedNodeOverrides", {
        count: discardedNodeOverrides.toLocaleString(),
      }),
    );
  }

  return parts.join(" ");
}
