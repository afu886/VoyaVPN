import { commands } from "@/ipc/bindings";
import type {
  AppConfig_Serialize,
  AppError,
  AppUpdaterStatus,
  CertificateFetchRequest,
  CertificateFetchResult,
  ProxyConnectionsSnapshot,
  ProxyDelayTestResult,
  ProxyMonitorStatus,
  ProxyGroupsSnapshot,
  DemoRequest,
  DemoResponse,
  DnsSettings_Deserialize,
  DnsSettings_Serialize,
  ExportProfilesResult,
  GroupChildCandidate,
  GroupPreview,
  GroupValidationResult,
  ImportProfilesResult,
  MoveAction,
  ConfigSourceSettings,
  ConfigTemplateImportResult,
  ConfigTemplateSelection,
  ProfileDedupeResult,
  ProfileItem_Deserialize,
  ProfileListItem_Serialize,
  ProfileSortKey,
  QrCodeImage,
  QrScanResult,
  RoutingItem_Deserialize,
  RoutingItem_Serialize,
  TrafficMode,
  RulesItem_Deserialize,
  RuntimeStatusResponse,
  CoreSeedInstallResult,
  CoreType,
  ResourceUpdateFile,
  SpeedActionType,
  SpeedtestRunResult,
  SpeedtestStatus,
  SubItem_Deserialize,
  SubItem_Serialize,
  SubscriptionUpdateResult,
  SysProxyType,
  SystemProxyStatusResponse,
  TunProviderDiagnostics,
  TunStatus,
  UiPreferences,
  SettingsBundle_Deserialize,
  SettingsBundle_Serialize,
  WindowChromeConfig,
} from "@/ipc/bindings";

type CommandResult<T> = { status: "ok"; data: T } | { status: "error"; error: AppError };

export class IpcCommandError extends Error {
  readonly appError: AppError;

  constructor(appError: AppError) {
    super(formatAppError(appError));
    this.appError = appError;
    this.name = "IpcCommandError";
  }
}

export async function appHealth(): Promise<string> {
  return unwrapCommandResult(await commands.appHealth());
}

export async function loadAppConfig(): Promise<AppConfig_Serialize> {
  return unwrapCommandResult(await commands.loadAppConfig());
}

export async function loadUiPreferences(): Promise<UiPreferences> {
  return unwrapCommandResult(await commands.loadUiPreferences());
}

export async function loadSettingsBundle(): Promise<SettingsBundle_Serialize> {
  return unwrapCommandResult(await commands.loadSettingsBundle());
}

export async function saveSettingsBundle(
  bundle: SettingsBundle_Deserialize,
): Promise<SettingsBundle_Serialize> {
  return unwrapCommandResult(await commands.saveSettingsBundle(bundle));
}

export async function openSettingsWindow(): Promise<void> {
  unwrapCommandResult(await commands.openSettingsWindow());
}

export async function generateQrCode(content: string): Promise<QrCodeImage> {
  return unwrapCommandResult(await commands.generateQrCode(content));
}

export async function scanScreenQr(): Promise<QrScanResult> {
  return unwrapCommandResult(await commands.scanScreenQr());
}

export async function fetchCertificate(
  request: CertificateFetchRequest,
): Promise<CertificateFetchResult> {
  return unwrapCommandResult(await commands.fetchCertificate(request));
}

export async function calculateCertificateSha256(pem: string): Promise<string[]> {
  return unwrapCommandResult(await commands.calculateCertificateSha256(pem));
}

export async function connectActiveProfile(): Promise<RuntimeStatusResponse> {
  return unwrapCommandResult(await commands.connectActiveProfile());
}

export async function disconnectCore(): Promise<RuntimeStatusResponse> {
  return unwrapCommandResult(await commands.disconnectCore());
}

export async function restartCore(): Promise<RuntimeStatusResponse> {
  return unwrapCommandResult(await commands.restartCore());
}

export async function runtimeStatus(): Promise<RuntimeStatusResponse> {
  return unwrapCommandResult(await commands.runtimeStatus());
}

export async function systemProxyStatus(): Promise<SystemProxyStatusResponse> {
  return unwrapCommandResult(await commands.systemProxyStatus());
}

export async function setSystemProxyMode(mode: SysProxyType): Promise<SystemProxyStatusResponse> {
  return unwrapCommandResult(await commands.setSystemProxyMode(mode));
}

export async function tunStatus(): Promise<TunStatus> {
  return unwrapCommandResult(await commands.tunStatus());
}

export async function tunProviderDiagnostics(): Promise<TunProviderDiagnostics> {
  return unwrapCommandResult(await commands.tunProviderDiagnostics());
}

export async function setTunEnabled(enabled: boolean): Promise<TunStatus> {
  return unwrapCommandResult(await commands.setTunEnabled(enabled));
}

export async function tunRequestElevation(): Promise<TunStatus> {
  return unwrapCommandResult(await commands.tunRequestElevation());
}

export async function tunRevokeElevation(): Promise<TunStatus> {
  return unwrapCommandResult(await commands.tunRevokeElevation());
}

export async function loadDnsSettings(): Promise<DnsSettings_Serialize> {
  return unwrapCommandResult(await commands.loadDnsSettings());
}

export async function saveDnsSettings(settings: DnsSettings_Deserialize): Promise<DnsSettings_Serialize> {
  return unwrapCommandResult(await commands.saveDnsSettings(settings));
}

export async function listProfiles(
  subid: string | null = null,
  filter: string | null = null,
): Promise<ProfileListItem_Serialize[]> {
  return unwrapCommandResult(await commands.listProfiles(subid, filter));
}

export async function getProfile(indexId: string): Promise<ProfileListItem_Serialize | null> {
  return unwrapCommandResult(await commands.getProfile(indexId));
}

export async function saveProfile(
  profile: ProfileItem_Deserialize,
): Promise<ProfileListItem_Serialize> {
  return unwrapCommandResult(await commands.saveProfile(profile));
}

export async function listGroupChildCandidates(
  currentIndexId: string | null = null,
  filter: string | null = null,
): Promise<GroupChildCandidate[]> {
  return unwrapCommandResult(await commands.listGroupChildCandidates(currentIndexId, filter));
}

export async function validateGroupProfile(
  profile: ProfileItem_Deserialize,
): Promise<GroupValidationResult> {
  return unwrapCommandResult(await commands.validateGroupProfile(profile));
}

export async function previewGroupProfile(profile: ProfileItem_Deserialize): Promise<GroupPreview> {
  return unwrapCommandResult(await commands.previewGroupProfile(profile));
}

export async function saveGroupProfile(
  profile: ProfileItem_Deserialize,
): Promise<ProfileListItem_Serialize> {
  return unwrapCommandResult(await commands.saveGroupProfile(profile));
}

export async function deleteProfiles(indexIds: string[]): Promise<number> {
  return unwrapCommandResult(await commands.deleteProfiles(indexIds));
}

export async function copyProfiles(indexIds: string[]): Promise<ProfileListItem_Serialize[]> {
  return unwrapCommandResult(await commands.copyProfiles(indexIds));
}

export async function exportProfileShareLinks(indexIds: string[]): Promise<ExportProfilesResult> {
  return unwrapCommandResult(await commands.exportProfileShareLinks(indexIds));
}

export async function exportProfileShareLinksBase64(indexIds: string[]): Promise<ExportProfilesResult> {
  return unwrapCommandResult(await commands.exportProfileShareLinksBase64(indexIds));
}

export async function exportProfileInnerLinks(indexIds: string[]): Promise<ExportProfilesResult> {
  return unwrapCommandResult(await commands.exportProfileInnerLinks(indexIds));
}

export async function exportProfileClientConfig(indexIds: string[]): Promise<ExportProfilesResult> {
  return unwrapCommandResult(await commands.exportProfileClientConfig(indexIds));
}

export async function setActiveProfile(indexId: string): Promise<ProfileListItem_Serialize> {
  return unwrapCommandResult(await commands.setActiveProfile(indexId));
}

export async function moveProfile(
  subid: string | null,
  indexId: string,
  action: MoveAction,
  position: number | null = null,
): Promise<ProfileListItem_Serialize[]> {
  return unwrapCommandResult(await commands.moveProfile(subid, indexId, action, position));
}

export async function sortProfiles(
  subid: string | null,
  sortKey: ProfileSortKey,
  ascending: boolean,
): Promise<ProfileListItem_Serialize[]> {
  return unwrapCommandResult(await commands.sortProfiles(subid, sortKey, ascending));
}

export async function moveProfilesToGroup(indexIds: string[], subid: string): Promise<number> {
  return unwrapCommandResult(await commands.moveProfilesToGroup(indexIds, subid));
}

export async function dedupeProfiles(
  subid: string | null = null,
  keepOlder: boolean | null = null,
): Promise<ProfileDedupeResult> {
  return unwrapCommandResult(await commands.dedupeProfiles(subid, keepOlder));
}

export async function listSubscriptions(): Promise<SubItem_Serialize[]> {
  return unwrapCommandResult(await commands.listSubscriptions());
}

export async function getSubscription(id: string): Promise<SubItem_Serialize | null> {
  return unwrapCommandResult(await commands.getSubscription(id));
}

export async function saveSubscription(item: SubItem_Deserialize): Promise<SubItem_Serialize> {
  return unwrapCommandResult(await commands.saveSubscription(item));
}

export async function deleteSubscriptions(ids: string[]): Promise<number> {
  return unwrapCommandResult(await commands.deleteSubscriptions(ids));
}

export async function importProfilesFromText(
  text: string,
  subid: string | null = null,
  isSub = false,
): Promise<ImportProfilesResult> {
  return unwrapCommandResult(await commands.importProfilesFromText(text, subid, isSub));
}

export async function importProfilesFromFile(
  path: string,
  subid: string | null = null,
  isSub = false,
): Promise<ImportProfilesResult> {
  return unwrapCommandResult(await commands.importProfilesFromFile(path, subid, isSub));
}

export async function updateSubscriptions(
  subid: string | null = null,
  preferProxy = true,
  proxyUrl: string | null = null,
): Promise<SubscriptionUpdateResult> {
  return unwrapCommandResult(await commands.updateSubscriptions(subid, preferProxy, proxyUrl));
}

export async function runDueSubscriptionUpdates(
  preferProxy = true,
  proxyUrl: string | null = null,
): Promise<SubscriptionUpdateResult> {
  return unwrapCommandResult(await commands.runDueSubscriptionUpdates(preferProxy, proxyUrl));
}

export async function listRoutings(): Promise<RoutingItem_Serialize[]> {
  return unwrapCommandResult(await commands.listRoutings());
}

export async function getRouting(id: string): Promise<RoutingItem_Serialize | null> {
  return unwrapCommandResult(await commands.getRouting(id));
}

export async function saveRouting(item: RoutingItem_Deserialize): Promise<RoutingItem_Serialize> {
  return unwrapCommandResult(await commands.saveRouting(item));
}

export async function deleteRoutings(ids: string[]): Promise<number> {
  return unwrapCommandResult(await commands.deleteRoutings(ids));
}

export async function setActiveRouting(id: string): Promise<RoutingItem_Serialize> {
  return unwrapCommandResult(await commands.setActiveRouting(id));
}

export async function saveRoutingRule(
  routingId: string,
  rule: RulesItem_Deserialize,
): Promise<RoutingItem_Serialize> {
  return unwrapCommandResult(await commands.saveRoutingRule(routingId, rule));
}

export async function deleteRoutingRules(
  routingId: string,
  ruleIds: string[],
): Promise<RoutingItem_Serialize> {
  return unwrapCommandResult(await commands.deleteRoutingRules(routingId, ruleIds));
}

export async function moveRoutingRule(
  routingId: string,
  ruleId: string,
  action: MoveAction,
  position: number | null = null,
): Promise<RoutingItem_Serialize> {
  return unwrapCommandResult(await commands.moveRoutingRule(routingId, ruleId, action, position));
}

export async function importConfigTemplate(
  selection: ConfigTemplateSelection,
  preferProxy = true,
  proxyUrl: string | null = null,
): Promise<ConfigTemplateImportResult> {
  return unwrapCommandResult(
    await commands.importConfigTemplate(selection, preferProxy, proxyUrl),
  );
}

export async function proxyListGroups(): Promise<ProxyGroupsSnapshot> {
  return unwrapCommandResult(await commands.proxyListGroups());
}

export async function proxyTestDelay(nodeNames: string[] = []): Promise<ProxyDelayTestResult[]> {
  return unwrapCommandResult(await commands.proxyTestDelay(nodeNames));
}

export async function proxySelectNode(
  groupName: string,
  nodeName: string,
): Promise<ProxyGroupsSnapshot> {
  return unwrapCommandResult(await commands.proxySelectNode(groupName, nodeName));
}

export async function proxyListConnections(): Promise<ProxyConnectionsSnapshot> {
  return unwrapCommandResult(await commands.proxyListConnections());
}

export async function proxyCloseConnection(
  connectionId: string | null = null,
): Promise<ProxyConnectionsSnapshot> {
  return unwrapCommandResult(await commands.proxyCloseConnection(connectionId));
}

export async function proxySetTrafficMode(mode: TrafficMode): Promise<AppConfig_Serialize> {
  return unwrapCommandResult(await commands.proxySetTrafficMode(mode));
}

export async function proxyReloadConfig(path: string | null = null): Promise<null> {
  return unwrapCommandResult(await commands.proxyReloadConfig(path));
}

export async function proxyStartMonitor(): Promise<ProxyMonitorStatus> {
  return unwrapCommandResult(await commands.proxyStartMonitor());
}

export async function proxyStopMonitor(): Promise<ProxyMonitorStatus> {
  return unwrapCommandResult(await commands.proxyStopMonitor());
}

export async function runSpeedtest(
  action: SpeedActionType,
  indexIds: string[] = [],
): Promise<SpeedtestRunResult> {
  return unwrapCommandResult(await commands.runSpeedtest(action, indexIds));
}

export async function cancelSpeedtest(): Promise<SpeedtestStatus> {
  return unwrapCommandResult(await commands.cancelSpeedtest());
}

export async function speedtestStatus(): Promise<SpeedtestStatus> {
  return unwrapCommandResult(await commands.speedtestStatus());
}

export async function appUpdateStatus(): Promise<AppUpdaterStatus> {
  return unwrapCommandResult(await commands.appUpdateStatus());
}

export async function loadConfigSources(): Promise<ConfigSourceSettings> {
  return unwrapCommandResult(await commands.loadConfigSources());
}

export async function updateGeoAssets(): Promise<ResourceUpdateFile[]> {
  return unwrapCommandResult(await commands.updateGeoAssets());
}

export async function updateSrsAssets(): Promise<ResourceUpdateFile[]> {
  return unwrapCommandResult(await commands.updateSrsAssets());
}

export async function installCoreSeed(coreType: CoreType): Promise<CoreSeedInstallResult> {
  return unwrapCommandResult(await commands.installCoreSeed(coreType));
}

export async function getWindowChromeConfig(): Promise<WindowChromeConfig> {
  return unwrapCommandResult(await commands.getWindowChromeConfig());
}

export async function setWindowAcrylic(dark: boolean): Promise<null> {
  return unwrapCommandResult(await commands.setWindowAcrylic(dark));
}

export async function demoRoundTrip(message: string): Promise<DemoResponse> {
  const request: DemoRequest = { message };

  return unwrapCommandResult(await commands.ipcDemoRoundTrip(request));
}

function unwrapCommandResult<T>(result: CommandResult<T>): T {
  if (result.status === "error") {
    throw new IpcCommandError(result.error);
  }

  return result.data;
}

function formatAppError(error: AppError): string {
  switch (error.kind) {
    case "eventEmit":
      return error.message;
    case "autostart":
      return error.message;
    case "configLoad":
      return error.message;
    case "configSave":
      return error.message;
    case "certificate":
      return error.message;
    case "proxyRuntime":
      return error.message;
    case "database":
      return error.message;
    case "dns":
      return error.message.message;
    case "group":
      return error.message;
    case "hotkey":
      return error.message;
    case "preset":
      return error.message;
    case "profile":
      return error.message;
    case "qr":
      return error.message;
    case "export":
      return error.message;
    case "missingCore":
      return error.message.message;
    case "runtime":
      return error.message;
    case "routing":
      return error.message;
    case "speedtest":
      return error.message;
    case "sudo":
      return error.message;
    case "subscription":
      return error.message;
    case "sysProxy":
      return error.message;
    case "state":
      return error.message;
    case "tun":
      return error.message;
    case "update":
      return error.message;
  }
}
