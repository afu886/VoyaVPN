import type { Page } from "@playwright/test";

export async function installTauriSmokeMock(page: Page) {
  await page.addInitScript(() => {
    type CommandArgs = Record<string, unknown>;
    type Profile = Record<string, unknown>;
    type ProfileRow = {
      profile: Profile;
      profileEx: Record<string, unknown>;
      serverStat: Record<string, unknown>;
      isActive: boolean;
    };
    type Routing = {
      Id: string;
      Remarks: string;
      Url: string;
      RuleSet: Rule[];
      RuleNum: number;
      Enabled: boolean;
      Locked: boolean;
      CustomIcon: string;
      CustomRulesetPath4Singbox: string;
      DomainStrategy: string;
      DomainStrategy4Singbox: string;
      Sort: number;
      IsActive: boolean;
    };
    type Rule = {
      Id: string;
      Type?: string | null;
      Port?: string | null;
      Network?: string | null;
      InboundTag?: string[] | null;
      OutboundTag?: string | null;
      Ip?: string[] | null;
      Domain?: string[] | null;
      Protocol?: string[] | null;
      Process?: string[] | null;
      Enabled: boolean;
      Remarks?: string | null;
      RuleType?: number | null;
    };
    type Callback = (event: { id: number; event: string; payload: unknown }) => void;

    const callbacks = new Map<number, Callback>();
    let nextCallbackId = 1;
    let nextProfileId = 1;
    let nextRoutingId = 1;
    let nextRuleId = 1;

    const state = {
      appConfig: makeAppConfig(),
      calls: [] as Array<{ command: string; args: CommandArgs }>,
      dns: makeDnsSettings(),
      profiles: [] as ProfileRow[],
      routings: [makeRouting("routing-default", "Default routing", true)],
      runtime: {
        activeProfileId: null as string | null,
        mainPid: null as number | null,
        prePid: null as number | null,
        runningCoreType: null as number | null,
        state: "disconnected",
      },
      sources: {
        geoSourceUrl: null as string | null,
        routeRulesTemplateSourceUrl: null as string | null,
        srsSourceUrl: null as string | null,
      },
      settingsBundle: makeSettingsBundle(),
      sysProxy: {
        effectiveMode: 0,
        exceptions: "",
        pacAvailable: false,
        pacUrl: null as string | null,
        proxy: null as string | null,
        requestedMode: 0,
      },
      tun: {
        allowEnableTun: true,
        backend: "process",
        elevationGranted: true,
        enabled: false,
        expectedProviderPath: null as string | null,
        lastProviderError: null as string | null,
        nativeComponentReady: true,
        needsServiceInstall: false,
        needsVpnPermission: false,
        preflight: {
          notes: [] as string[],
          platform: "linux",
          routeRestoreNote: "Smoke mock does not mutate routes.",
          state: "ready",
          windowsCleanupDevices: [] as string[],
        },
        providerPathMismatch: false,
        providerState: "notApplicable",
        requiresElevation: false,
        resolvedProviderPath: null as string | null,
        restoreOnDisconnect: true,
      },
    };

    function invoke(command: string, args: CommandArgs = {}) {
      state.calls.push({ command, args });

      switch (command) {
        case "plugin:event|listen":
          return Promise.resolve(nextCallbackId++);
        case "plugin:event|unlisten":
        case "plugin:event|emit":
        case "plugin:event|emit_to":
        case "plugin:resources|close":
        case "plugin:window|close":
        case "plugin:window|set_title":
          return Promise.resolve(null);
        case "plugin:app|version":
          return Promise.resolve("0.1.0");
        case "plugin:updater|check":
          return Promise.resolve({
            body: null,
            currentVersion: "0.1.0",
            date: null,
            rawJson: { downloadUrl: "https://cdn.voyavpn.test/stable/latest.json" },
            rid: 9001,
            version: "0.2.0",
          });
        case "plugin:updater|download_and_install":
        case "plugin:process|restart":
          return Promise.resolve(null);
        case "open_settings_window":
          return Promise.resolve(null);
        case "load_ui_preferences":
          return Promise.resolve(uiPreferencesFromConfig());
        case "load_settings_bundle":
          return Promise.resolve(clone(state.settingsBundle));
        case "save_settings_bundle":
          state.settingsBundle = cloneRecord(args.bundle) as typeof state.settingsBundle;
          return Promise.resolve(clone(state.settingsBundle));
        case "runtime_status":
          return Promise.resolve(clone(state.runtime));
        case "connect_active_profile": {
          const active = state.profiles.find((row) => row.isActive) ?? state.profiles[0] ?? null;
          state.runtime = {
            activeProfileId: active ? String(active.profile.IndexId) : null,
            mainPid: 4242,
            prePid: null,
            runningCoreType: 2,
            state: "connected",
          };
          return Promise.resolve(clone(state.runtime));
        }
        case "disconnect_core":
          state.runtime = {
            activeProfileId: null,
            mainPid: null,
            prePid: null,
            runningCoreType: null,
            state: "disconnected",
          };
          return Promise.resolve(clone(state.runtime));
        case "restart_core":
          state.runtime = {
            ...state.runtime,
            mainPid: 4243,
            state: "connected",
          };
          return Promise.resolve(clone(state.runtime));
        case "system_proxy_status":
          return Promise.resolve(clone(state.sysProxy));
        case "set_system_proxy_mode":
          state.sysProxy = {
            ...state.sysProxy,
            effectiveMode: Number(args.mode ?? 0),
            requestedMode: Number(args.mode ?? 0),
          };
          return Promise.resolve(clone(state.sysProxy));
        case "tun_status":
          return Promise.resolve(clone(state.tun));
        case "tun_request_elevation":
          state.tun = { ...state.tun, elevationGranted: true, requiresElevation: false };
          return Promise.resolve(clone(state.tun));
        case "set_tun_enabled":
          state.tun = { ...state.tun, enabled: Boolean(args.enabled) };
          return Promise.resolve(clone(state.tun));
        case "list_profiles":
          return Promise.resolve(filterProfiles(state.profiles, args.filter));
        case "save_profile": {
          const row = upsertProfile(readRecord(args, "profile"));
          return Promise.resolve(clone(row));
        }
        case "save_group_profile": {
          const row = upsertProfile(readRecord(args, "profile"));
          return Promise.resolve(clone(row));
        }
        case "set_active_profile": {
          const row = setActiveProfile(String(args.indexId ?? ""));
          return Promise.resolve(clone(row));
        }
        case "delete_profiles": {
          const ids = readStringArray(args, "indexIds");
          state.profiles = state.profiles.filter((row) => !ids.includes(String(row.profile.IndexId)));
          return Promise.resolve(ids.length);
        }
        case "copy_profiles": {
          const ids = readStringArray(args, "indexIds");
          const copies = state.profiles
            .filter((row) => ids.includes(String(row.profile.IndexId)))
            .map((row) =>
              upsertProfile({
                ...row.profile,
                IndexId: undefined,
                Remarks: `${String(row.profile.Remarks)} Copy`,
              }),
            );
          return Promise.resolve(clone(copies));
        }
        case "move_profile":
        case "sort_profiles":
          return Promise.resolve(clone(state.profiles));
        case "dedupe_profiles":
          return Promise.resolve({ kept: state.profiles.length, removedIndexIds: [], total: state.profiles.length });
        case "list_group_child_candidates":
          return Promise.resolve(
            state.profiles.map((row) => ({
              address: row.profile.Address,
              configType: row.profile.ConfigType,
              indexId: row.profile.IndexId,
              isGroup: Number(row.profile.ConfigType) >= 101,
              reason: null,
              remarks: row.profile.Remarks,
              selectable: true,
              subid: row.profile.Subid,
            })),
          );
        case "preview_group_profile":
          return Promise.resolve({
            singboxRoutes: [],
            validation: { childIndexIds: [], errors: [], normalizedChildItems: "", valid: true, warnings: [] },
          });
        case "list_subscriptions":
          return Promise.resolve([]);
        case "save_subscription":
          return Promise.resolve({ Id: "sub-smoke", Remarks: "Smoke", Url: "", MoreUrl: "", Enabled: true, UserAgent: "", Sort: 0 });
        case "delete_subscriptions":
          return Promise.resolve(0);
        case "export_profile_share_links": {
          const indexIds = readStringArray(args, "indexIds");
          const links = indexIds.map((indexId) => {
            const profile = state.profiles.find((item) => item.profile.IndexId === indexId)?.profile;
            if (!profile) {
              throw new Error(`missing profile ${indexId}`);
            }

            return `vless://${encodeURIComponent(String(profile.Password))}@${String(profile.Address)}:${String(profile.Port)}#${encodeURIComponent(String(profile.Remarks))}`;
          });

          return Promise.resolve({ count: links.length, format: "shareLinks", text: links.join("\n") });
        }
        case "import_profiles_from_text": {
          const row = upsertProfile(importedProfile(String(args.text ?? "")));
          return Promise.resolve({ imported: 1, importedIndexIds: [row.profile.IndexId], removedExisting: 0, skipped: 0, subid: args.subid ?? null });
        }
        case "update_subscriptions":
          return Promise.resolve({ imported: 0, messages: [], removedExisting: 0, skipped: 0, updated: 0 });
        case "run_speedtest":
          return Promise.resolve({ action: args.action, message: "smoke skipped real speedtest", requested: readStringArray(args, "indexIds").length, started: false });
        case "cancel_speedtest":
        case "speedtest_status":
          return Promise.resolve({ running: false });
        case "list_routings":
          return Promise.resolve(clone(state.routings));
        case "save_routing": {
          const routing = upsertRouting(readRecord(args, "item"));
          return Promise.resolve(clone(routing));
        }
        case "set_active_routing": {
          state.routings = state.routings.map((routing) => ({ ...routing, IsActive: routing.Id === args.id }));
          return Promise.resolve(clone(state.routings.find((routing) => routing.Id === args.id) ?? state.routings[0]));
        }
        case "delete_routings": {
          const ids = readStringArray(args, "ids");
          state.routings = state.routings.filter((routing) => !ids.includes(routing.Id));
          return Promise.resolve(ids.length);
        }
        case "save_routing_rule": {
          const routing = state.routings.find((item) => item.Id === args.routingId) ?? state.routings[0];
          const rule = normalizeRule(readRecord(args, "rule"));
          const existingIndex = routing.RuleSet.findIndex((item) => item.Id === rule.Id);
          routing.RuleSet =
            existingIndex >= 0
              ? routing.RuleSet.map((item) => (item.Id === rule.Id ? rule : item))
              : [...routing.RuleSet, rule];
          routing.RuleNum = routing.RuleSet.length;
          return Promise.resolve(clone(routing));
        }
        case "delete_routing_rules": {
          const routing = state.routings.find((item) => item.Id === args.routingId) ?? state.routings[0];
          const ids = readStringArray(args, "ruleIds");
          routing.RuleSet = routing.RuleSet.filter((rule) => !ids.includes(rule.Id));
          routing.RuleNum = routing.RuleSet.length;
          return Promise.resolve(clone(routing));
        }
        case "move_routing_rule": {
          const routing = state.routings.find((item) => item.Id === args.routingId) ?? state.routings[0];
          return Promise.resolve(clone(routing));
        }
        case "import_config_template": {
          const selection = readRecord(args, "selection");
          const selectionType = String(selection.type ?? "default");
          const customSources = readRecord(selection, "sources");
          state.sources =
            selectionType === "custom"
              ? {
                  geoSourceUrl: (customSources.geoSourceUrl as string | null) ?? null,
                  routeRulesTemplateSourceUrl:
                    (customSources.routeRulesTemplateSourceUrl as string | null) ?? null,
                  srsSourceUrl: (customSources.srsSourceUrl as string | null) ?? null,
                }
              : selectionType === "default"
                ? { geoSourceUrl: null, routeRulesTemplateSourceUrl: null, srsSourceUrl: null }
                : {
                    geoSourceUrl: `https://rules.example.test/${selectionType}/geo/{0}.dat`,
                    routeRulesTemplateSourceUrl: `https://rules.example.test/${selectionType}/template.json`,
                    srsSourceUrl: `https://rules.example.test/${selectionType}/{1}.srs`,
                  };
          state.appConfig.ConstItem.GeoSourceUrl = state.sources.geoSourceUrl;
          state.appConfig.ConstItem.RouteRulesTemplateSourceUrl = state.sources.routeRulesTemplateSourceUrl;
          state.appConfig.ConstItem.SrsSourceUrl = state.sources.srsSourceUrl;
          state.settingsBundle.sources = clone(state.sources);
          state.routings = state.routings.map((routing, index) => ({
            ...routing,
            IsActive: index === 0,
          }));
          return Promise.resolve({
            activeRoutingId: state.routings[0]?.Id ?? null,
            reusedExistingRouting: true,
            routingIds: state.routings.map((routing) => routing.Id),
            simpleDnsFetched: false,
            sources: clone(state.sources),
          });
        }
        case "load_dns_settings":
          return Promise.resolve(clone(state.dns));
        case "save_dns_settings":
          state.dns = mergeDeep(state.dns, readRecord(args, "settings"));
          return Promise.resolve(clone(state.dns));
        case "proxy_list_groups":
          return Promise.resolve({
            groups: [
              {
                name: "PROXY",
                nodes: [
                  { active: true, delay: 23, delayLabel: "23 ms", name: "Smoke Node", proxyType: "VLESS", testable: true, udp: true },
                  { active: false, delay: 41, delayLabel: "41 ms", name: "Smoke Backup Node", proxyType: "VLESS", testable: true, udp: true },
                ],
                now: "Smoke Node",
                proxyType: "Selector",
              },
            ],
            trafficMode: 0,
          });
        case "proxy_test_delay":
          return Promise.resolve(readStringArray(args, "nodeNames").map((name) => ({ delay: 23, message: null, name })));
        case "proxy_select_node":
          return invoke("proxy_list_groups", args);
        case "proxy_list_connections":
          return Promise.resolve({
            connections: [
              {
                chains: ["PROXY", "Smoke Node"],
                connectionType: "HTTPS",
                destination: "93.184.216.34",
                download: 2048,
                host: "smoke.example.test:443",
                id: "smoke-connection",
                network: "tcp",
                process: "smoke-app",
                processPath: "/usr/bin/smoke-app",
                rule: "Match",
                rulePayload: "",
                source: "127.0.0.1:54321",
                start: "2026-01-01T00:00:00Z",
                upload: 1024,
              },
            ],
            downloadTotal: 2048,
            uploadTotal: 1024,
          });
        case "proxy_close_connection":
          return Promise.resolve({ connections: [], downloadTotal: 0, uploadTotal: 0 });
        case "proxy_set_traffic_mode":
          return Promise.resolve(clone(state.appConfig));
        case "proxy_reload_config":
          return Promise.resolve(null);
        case "proxy_start_monitor":
          return Promise.resolve({ message: null, running: true, stale: false, state: "running" });
        case "proxy_stop_monitor":
          return Promise.resolve({ message: null, running: false, stale: true, state: "stopped" });
        case "generate_qr_code":
          return Promise.resolve({
            mimeType: "image/svg+xml",
            svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><rect width=\"64\" height=\"64\" fill=\"white\"/><rect x=\"8\" y=\"8\" width=\"16\" height=\"16\" fill=\"black\"/><rect x=\"40\" y=\"8\" width=\"16\" height=\"16\" fill=\"black\"/><rect x=\"8\" y=\"40\" width=\"16\" height=\"16\" fill=\"black\"/><rect x=\"32\" y=\"32\" width=\"8\" height=\"8\" fill=\"black\"/></svg>",
          });
        case "app_update_status":
          return Promise.resolve({ currentVersion: "0.1.0", message: null, state: "ready" });
        case "update_geo_assets":
          return Promise.resolve([{ bytes: 1024, name: "geoip.db", usedProxy: false }]);
        case "update_srs_assets":
          return Promise.resolve([{ bytes: 512, name: "rules.srs", usedProxy: false }]);
        default:
          throw { kind: "state", message: `Unhandled smoke command: ${command}` };
      }
    }

    window.__TAURI_INTERNALS__ = {
      invoke,
      metadata: {
        currentWindow: {
          label: window.location.search.includes("window=settings") ? "settings" : "main",
        },
      },
      transformCallback(callback: Callback) {
        const id = nextCallbackId++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
    };
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener() {
        return undefined;
      },
    };
    window.__VOYA_SMOKE__ = {
      emit(event: string, payload: unknown) {
        callbacks.forEach((callback, id) => callback({ event, id, payload }));
      },
      state,
    };

    function upsertProfile(input: Record<string, unknown>) {
      const profile = normalizeProfile(input);
      const existingIndex = state.profiles.findIndex((row) => row.profile.IndexId === profile.IndexId);
      const existing = existingIndex >= 0 ? state.profiles[existingIndex] : null;
      const row = {
        isActive: existing?.isActive ?? state.profiles.length === 0,
        profile,
        profileEx: {
          Delay: existing?.profileEx.Delay ?? -1,
          IndexId: profile.IndexId,
          IpInfo: existing?.profileEx.IpInfo ?? null,
          Message: existing?.profileEx.Message ?? null,
          Sort: existing?.profileEx.Sort ?? state.profiles.length,
          Speed: existing?.profileEx.Speed ?? null,
        },
        serverStat: existing?.serverStat ?? {
          DateNow: 20260601,
          IndexId: profile.IndexId,
          TodayDown: 0,
          TodayUp: 0,
          TotalDown: 0,
          TotalUp: 0,
        },
      };

      if (existingIndex >= 0) {
        state.profiles[existingIndex] = row;
      } else {
        state.profiles.push(row);
      }

      if (row.isActive) {
        setActiveProfile(String(row.profile.IndexId));
      }

      return row;
    }

    function setActiveProfile(indexId: string) {
      state.profiles = state.profiles.map((row) => ({ ...row, isActive: row.profile.IndexId === indexId }));
      const row = state.profiles.find((item) => item.profile.IndexId === indexId) ?? null;
      state.appConfig.IndexId = row ? String(row.profile.IndexId) : "";
      return row;
    }

    function normalizeProfile(input: Record<string, unknown>): Profile {
      const configType = Number(input.ConfigType ?? 5);
      const id = String(input.IndexId ?? `profile-smoke-${nextProfileId++}`);

      return {
        Address: String(input.Address ?? "smoke.example.test"),
        Alpn: String(input.Alpn ?? ""),
        Cert: String(input.Cert ?? ""),
        CertSha: String(input.CertSha ?? ""),
        ConfigType: configType,
        ConfigVersion: Number(input.ConfigVersion ?? 4),
        CoreType: input.CoreType ?? null,
        DisplayLog: Boolean(input.DisplayLog ?? true),
        EchConfigList: String(input.EchConfigList ?? ""),
        Finalmask: String(input.Finalmask ?? ""),
        IndexId: id,
        IsSub: Boolean(input.IsSub ?? false),
        Mldsa65Verify: String(input.Mldsa65Verify ?? ""),
        Network: String(input.Network ?? "tcp"),
        Password: String(input.Password ?? "00000000-0000-4000-8000-000000000001"),
        Port: Number(input.Port ?? 443),
        PreSocksPort: input.PreSocksPort ?? null,
        ProtocolExtra: cloneRecord(input.ProtocolExtra),
        PublicKey: String(input.PublicKey ?? ""),
        Remarks: String(input.Remarks ?? "Smoke profile"),
        ShortId: String(input.ShortId ?? ""),
        Sni: String(input.Sni ?? ""),
        SpiderX: String(input.SpiderX ?? ""),
        StreamSecurity: String(input.StreamSecurity ?? ""),
        Subid: String(input.Subid ?? ""),
        TransportExtra: cloneRecord(input.TransportExtra),
        Username: String(input.Username ?? ""),
      };
    }

    function importedProfile(text: string): Profile {
      const remark = decodeURIComponent(text.split("#")[1] ?? "Smoke Imported VLESS").replaceAll("+", " ");
      const addressMatch = text.match(/@([^:/?#]+)(?::(\d+))?/u);

      return normalizeProfile({
        Address: addressMatch?.[1] ?? "imported.example.test",
        ConfigType: 5,
        Network: text.includes("type=ws") ? "ws" : "tcp",
        Password: text.match(/^vless:\/\/([^@]+)/u)?.[1] ?? "00000000-0000-4000-8000-000000000002",
        Port: Number(addressMatch?.[2] ?? 443),
        Remarks: remark,
        StreamSecurity: text.includes("security=tls") ? "tls" : "",
        TransportExtra: {
          Host: "cdn.example.test",
          Path: "/ws",
        },
      });
    }

    function filterProfiles(rows: ProfileRow[], filter: unknown) {
      const needle = String(filter ?? "").trim().toLowerCase();
      if (!needle) {
        return clone(rows);
      }

      return clone(
        rows.filter((row) =>
          [row.profile.Remarks, row.profile.Address, row.profile.Subid]
            .join(" ")
            .toLowerCase()
            .includes(needle),
        ),
      );
    }

    function upsertRouting(input: Record<string, unknown>) {
      const id = String(input.Id ?? `routing-smoke-${nextRoutingId++}`);
      const existingIndex = state.routings.findIndex((routing) => routing.Id === id);
      const existing = existingIndex >= 0 ? state.routings[existingIndex] : null;
      const routing = {
        CustomIcon: String(input.CustomIcon ?? existing?.CustomIcon ?? ""),
        CustomRulesetPath4Singbox: String(input.CustomRulesetPath4Singbox ?? existing?.CustomRulesetPath4Singbox ?? ""),
        DomainStrategy: String(input.DomainStrategy ?? existing?.DomainStrategy ?? "AsIs"),
        DomainStrategy4Singbox: String(input.DomainStrategy4Singbox ?? existing?.DomainStrategy4Singbox ?? ""),
        Enabled: Boolean(input.Enabled ?? existing?.Enabled ?? true),
        Id: id,
        IsActive: Boolean(input.IsActive ?? existing?.IsActive ?? state.routings.length === 0),
        Locked: Boolean(input.Locked ?? existing?.Locked ?? false),
        Remarks: String(input.Remarks ?? existing?.Remarks ?? "Smoke routing"),
        RuleNum: existing?.RuleSet.length ?? 0,
        RuleSet: existing?.RuleSet ?? [],
        Sort: Number(input.Sort ?? existing?.Sort ?? state.routings.length),
        Url: String(input.Url ?? existing?.Url ?? ""),
      };

      if (existingIndex >= 0) {
        state.routings[existingIndex] = routing;
      } else {
        state.routings.push(routing);
      }

      return routing;
    }

    function normalizeRule(input: Record<string, unknown>): Rule {
      return {
        Domain: readNullableStringArray(input, "Domain"),
        Enabled: Boolean(input.Enabled ?? true),
        Id: String(input.Id ?? `rule-smoke-${nextRuleId++}`),
        InboundTag: readNullableStringArray(input, "InboundTag"),
        Ip: readNullableStringArray(input, "Ip"),
        Network: nullableString(input.Network),
        OutboundTag: nullableString(input.OutboundTag ?? "proxy"),
        Port: nullableString(input.Port),
        Process: readNullableStringArray(input, "Process"),
        Protocol: readNullableStringArray(input, "Protocol"),
        Remarks: nullableString(input.Remarks ?? "Smoke rule"),
        RuleType: Number(input.RuleType ?? 1),
        Type: nullableString(input.Type),
      };
    }

    function makeRouting(id: string, remarks: string, active: boolean): Routing {
      return {
        CustomIcon: "",
        CustomRulesetPath4Singbox: "",
        DomainStrategy: "AsIs",
        DomainStrategy4Singbox: "",
        Enabled: true,
        Id: id,
        IsActive: active,
        Locked: false,
        Remarks: remarks,
        RuleNum: 0,
        RuleSet: [],
        Sort: 0,
        Url: "",
      };
    }

    function makeAppConfig() {
      return {
        ProxyUIItem: {
          NodeSorting: 0,
          TrafficMode: 0,
        },
        ConstItem: {
          GeoSourceUrl: null as string | null,
          RouteRulesTemplateSourceUrl: null as string | null,
          SrsSourceUrl: null as string | null,
          SubConvertUrl: null as string | null,
        },
        CoreBasicItem: {
          BindInterface: null as string | null,
          DefAllowInsecure: false,
          DefFingerprint: "",
          DefUserAgent: "",
          EnableCacheFile4Sbox: true,
          EnableFragment: false,
          LogEnabled: false,
          Loglevel: "warning",
          MuxEnabled: false,
          SendThrough: null as string | null,
        },
        GUIItem: {
          AutoRun: false,
          DisplayRealTimeSpeed: false,
          EnableStatistics: false,
        },
        GlobalHotkeys: [],
        GrpcItem: {
          HealthCheckTimeout: 20,
          IdleTimeout: 60,
          PermitWithoutStream: false,
        },
        HysteriaItem: {
          DownMbps: 100,
          HopInterval: 30,
          UpMbps: 100,
        },
        Inbound: [{
          AllowLANConn: false,
          LocalPort: 10808,
          NewPort4Lan: false,
          Pass: "",
          Protocol: "socks",
          SecondLocalPortEnabled: false,
          SniffingEnabled: true,
          User: "",
        }],
        IndexId: "",
        Mux4SboxItem: {
          MaxConnections: 8,
          Padding: null as boolean | null,
          Protocol: "h2mux",
        },
        RoutingBasicItem: {
          DomainStrategy: "AsIs",
          DomainStrategy4Singbox: "",
          RoutingIndexId: "",
        },
        SimpleDNSItem: {},
        SpeedTestItem: {
          IPAPIUrl: "",
          MixedConcurrencyCount: 5,
          SpeedPingTestUrl: "https://www.google.com/generate_204",
          SpeedTestDelayInterval: null as number | null,
          SpeedTestPageSize: null as number | null,
          SpeedTestTimeout: 10,
          SpeedTestUrl: "https://cachefly.cachefly.net/50mb.test",
          UdpTestTarget: "ntp:pool.ntp.org",
        },
        SubIndexId: "",
        SystemProxyItem: {
          CustomSystemProxyPacPath: null,
          CustomSystemProxyScriptPath: null,
          NotProxyLocalAddress: true,
          SysProxyType: 0,
          SystemProxyAdvancedProtocol: "",
          SystemProxyExceptions: "",
        },
        TunModeItem: {
          AutoRoute: true,
          EnableIPv6Address: false,
          EnableTun: false,
          IcmpRouting: "rule",
          Mtu: 1500,
          Stack: "",
          StrictRoute: false,
        },
        UIItem: {
          CurrentLanguage: "en",
          CurrentTheme: "FollowSystem",
        },
      };
    }

    function uiPreferencesFromConfig() {
      const currentTheme = String(state.appConfig.UIItem.CurrentTheme ?? "").toLowerCase();

      return {
        language: String(state.appConfig.UIItem.CurrentLanguage ?? "en"),
        theme: currentTheme === "dark" ? "dark" : currentTheme === "light" ? "light" : "system",
      };
    }

    function makeSettingsBundle() {
      return {
        autostartEnabled: false,
        coreBasicItem: {
          DefAllowInsecure: false,
          DefFingerprint: "chrome",
          DefUserAgent: "",
          EnableCacheFile4Sbox: true,
          EnableFragment: false,
          LogEnabled: false,
          Loglevel: "warning",
          MuxEnabled: false,
        },
        hysteriaItem: { DownMbps: 100, HopInterval: 30, UpMbps: 100 },
        mux4SboxItem: { MaxConnections: 4, Padding: false, Protocol: "h2mux" },
        network: {
          systemProxy: {
            customSystemProxyPacPath: null,
            customSystemProxyScriptPath: null,
            notProxyLocalAddress: true,
            systemProxyAdvancedProtocol: "",
            systemProxyExceptions: "",
          },
          tun: {
            autoRoute: true,
            enableIpv6Address: false,
            icmpRouting: "rule",
            mtu: 1500,
            stack: "system",
            strictRoute: false,
          },
        },
        showWindowHotkey: {
          Alt: true,
          Control: true,
          EGlobalHotkey: 0,
          KeyCode: 86,
          Shift: false,
        },
        sources: {
          geoSourceUrl: null as string | null,
          routeRulesTemplateSourceUrl: null as string | null,
          srsSourceUrl: null as string | null,
        },
        speedTestItem: {
          IPAPIUrl: "",
          MixedConcurrencyCount: 5,
          SpeedPingTestUrl: "https://www.google.com/generate_204",
          SpeedTestDelayInterval: null,
          SpeedTestPageSize: null,
          SpeedTestTimeout: 10,
          SpeedTestUrl: "https://cachefly.cachefly.net/50mb.test",
          UdpTestTarget: "ntp:pool.ntp.org",
        },
        subConvertUrl: null,
        uiPreferences: { language: "en", theme: "system" },
      };
    }

    function makeDnsSettings() {
      return {
        simpleDnsItem: {
          AddCommonHosts: true,
          BlockBindingQuery: false,
          BootstrapDNS: "1.1.1.1",
          DirectDNS: "223.5.5.5",
          DirectExpectedIPs: "",
          FakeIP: false,
          GlobalFakeIp: false,
          Hosts: "",
          ParallelQuery: false,
          RemoteDNS: "https://1.1.1.1/dns-query",
          ServeStale: false,
          Strategy4Freedom: "AsIs",
          Strategy4Proxy: "UseIP",
          UseSystemHosts: true,
        },
      };
    }

    function clone<T>(value: T): T {
      return value === undefined ? value : structuredClone(value);
    }

    function cloneRecord(value: unknown) {
      return value && typeof value === "object" ? clone(value as Record<string, unknown>) : {};
    }

    function mergeDeep<T extends Record<string, unknown>>(target: T, patch: Record<string, unknown>): T {
      const next = clone(target) as Record<string, unknown>;
      Object.entries(patch).forEach(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value) && next[key] && typeof next[key] === "object" && !Array.isArray(next[key])) {
          next[key] = mergeDeep(next[key] as Record<string, unknown>, value as Record<string, unknown>);
        } else {
          next[key] = value;
        }
      });
      return next as T;
    }

    function readRecord(args: CommandArgs, key: string) {
      const value = args[key];
      return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    }

    function readArray(args: CommandArgs, key: string) {
      const value = args[key];
      return Array.isArray(value) ? value : [];
    }

    function readStringArray(args: CommandArgs, key: string) {
      return readArray(args, key).map(String);
    }

    function readNullableStringArray(input: Record<string, unknown>, key: string) {
      const value = input[key];
      if (!Array.isArray(value)) {
        return null;
      }
      return value.map(String);
    }

    function nullableString(value: unknown) {
      if (value === null || value === undefined || value === "") {
        return null;
      }
      return String(value);
    }
  });
}

declare global {
  interface Window {
    __TAURI_EVENT_PLUGIN_INTERNALS__: {
      unregisterListener: () => undefined;
    };
    __TAURI_INTERNALS__: {
      invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
      metadata: {
        currentWindow: {
          label: string;
        };
      };
      transformCallback: (callback: (event: { id: number; event: string; payload: unknown }) => void) => number;
      unregisterCallback: (id: number) => void;
    };
    __VOYA_SMOKE__: {
      emit: (event: string, payload: unknown) => void;
      state: unknown;
    };
  }
}
