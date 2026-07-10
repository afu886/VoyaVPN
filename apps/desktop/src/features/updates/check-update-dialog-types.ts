export type CoreRunMode = "check" | "download";

export type RunMode = CoreRunMode | "app-check" | "app-install" | "app-restart";

export type PreferenceSnapshot = {
  preRelease: boolean;
  selectedIds: string[];
};
