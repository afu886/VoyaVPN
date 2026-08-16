import { create } from "zustand";
import { z } from "zod";

import type {
  ProxyConnectionItem,
  ProxyConnectionsSnapshot,
  ProxyMonitorState,
  ProxyMonitorStatus,
  ProxyTrafficEvent,
  CoreStateEvent,
  LogLineEvent,
  ServerStatItem,
  SpeedTestResult,
  SpeedtestStatus,
  StatisticsSnapshot,
  SysProxyChanged,
  TransientStreamEvent,
  TunChanged,
} from "@/ipc/bindings";
import { speedtestStatus } from "@/ipc/commands";

export type RuntimeProxyMonitorState = "starting" | ProxyMonitorState;

export type RuntimeProxyMonitorStatus = {
  message: string | null;
  running: boolean;
  stale: boolean;
  state: RuntimeProxyMonitorState;
};

type RuntimeEventState = {
  clearLogs: () => void;
  proxyConnections: ProxyConnectionsSnapshot | null;
  proxyMonitorStatus: RuntimeProxyMonitorStatus;
  proxyTraffic: ProxyTrafficEvent | null;
  coreState: CoreStateEvent | null;
  lastTransientEvent: TransientStreamEvent | null;
  logLines: LogLineEvent[];
  pushTransientEvent: (event: TransientStreamEvent) => void;
  refreshSpeedtestStatus: () => Promise<void>;
  serverStatsByProfileId: Record<string, ServerStatItem>;
  speedtestResultsByProfileId: Record<string, SpeedTestResult>;
  speedtestRunning: boolean;
  setProxyConnections: (snapshot: ProxyConnectionsSnapshot) => void;
  setProxyMonitorFailed: (message?: string | null) => void;
  setProxyMonitorRunning: (message?: string | null) => void;
  setProxyMonitorStarting: (message?: string | null) => void;
  setProxyMonitorStatus: (status: ProxyMonitorStatus) => void;
  setProxyMonitorStopped: (message?: string | null) => void;
  setProxyTraffic: (event: ProxyTrafficEvent) => void;
  setCoreState: (event: CoreStateEvent) => void;
  setSpeedtestRunning: (running: boolean) => void;
  setSpeedtestStatus: (status: SpeedtestStatus) => void;
  setSysProxy: (event: SysProxyChanged) => void;
  setTun: (event: TunChanged) => void;
  statistics: StatisticsSnapshot | null;
  sysProxy: SysProxyChanged | null;
  tun: TunChanged | null;
};

type ProxyConnectionsEvent = Extract<TransientStreamEvent, { kind: "proxyConnections" }>;
type StatisticsEvent = Extract<TransientStreamEvent, { kind: "statistics" }>;
type FrameHandle = number | ReturnType<typeof setTimeout>;

let pendingProxyConnectionsEvent: ProxyConnectionsEvent | null = null;
let pendingProxyConnectionsFrame: FrameHandle | null = null;

const payloadStringSchema = z.string().max(4096);
const nullablePayloadStringSchema = payloadStringSchema.nullable();
const nonnegativeFiniteNumberSchema = z.number().finite().nonnegative();
const nullableNonnegativeFiniteNumberSchema = nonnegativeFiniteNumberSchema.nullable();

const proxyConnectionItemSchema: z.ZodType<ProxyConnectionItem> = z.object({
  chains: z.array(payloadStringSchema).max(512),
  connectionType: nullablePayloadStringSchema,
  destination: payloadStringSchema,
  download: nullableNonnegativeFiniteNumberSchema,
  host: payloadStringSchema,
  id: nullablePayloadStringSchema,
  network: nullablePayloadStringSchema,
  process: nullablePayloadStringSchema,
  processPath: nullablePayloadStringSchema,
  rule: nullablePayloadStringSchema,
  rulePayload: nullablePayloadStringSchema,
  source: payloadStringSchema,
  start: payloadStringSchema,
  upload: nullableNonnegativeFiniteNumberSchema,
});

const proxyConnectionsSnapshotSchema: z.ZodType<ProxyConnectionsSnapshot> = z.object({
  connections: z.array(proxyConnectionItemSchema).max(10_000),
  downloadTotal: nullableNonnegativeFiniteNumberSchema,
  uploadTotal: nullableNonnegativeFiniteNumberSchema,
});

const serverStatItemSchema: z.ZodType<ServerStatItem> = z.object({
  DateNow: nullableNonnegativeFiniteNumberSchema.optional(),
  IndexId: payloadStringSchema.optional(),
  TodayDown: nullableNonnegativeFiniteNumberSchema.optional(),
  TodayUp: nullableNonnegativeFiniteNumberSchema.optional(),
  TotalDown: nullableNonnegativeFiniteNumberSchema.optional(),
  TotalUp: nullableNonnegativeFiniteNumberSchema.optional(),
});

const statisticsSnapshotSchema: z.ZodType<StatisticsSnapshot> = z.object({
  activeProfileId: nullablePayloadStringSchema,
  directDownloadBytesPerSecond: nullableNonnegativeFiniteNumberSchema,
  directUploadBytesPerSecond: nullableNonnegativeFiniteNumberSchema,
  downloadBytesPerSecond: nullableNonnegativeFiniteNumberSchema,
  proxyDownloadBytesPerSecond: nullableNonnegativeFiniteNumberSchema,
  proxyUploadBytesPerSecond: nullableNonnegativeFiniteNumberSchema,
  serverStat: serverStatItemSchema.nullable(),
  uploadBytesPerSecond: nullableNonnegativeFiniteNumberSchema,
});

const initialProxyMonitorStatus: RuntimeProxyMonitorStatus = {
  message: null,
  running: false,
  stale: true,
  state: "stopped",
};

export const useRuntimeEventStore = create<RuntimeEventState>((set) => ({
  clearLogs: () => set({ logLines: [] }),
  proxyConnections: null,
  proxyMonitorStatus: initialProxyMonitorStatus,
  proxyTraffic: null,
  coreState: null,
  lastTransientEvent: null,
  logLines: [],
  pushTransientEvent: (event) => {
    if (event.kind === "proxyConnections") {
      const payload = parseProxyConnectionsSnapshot(event.payload);
      if (!payload) {
        return;
      }

      pendingProxyConnectionsEvent = { kind: "proxyConnections", payload };
      if (pendingProxyConnectionsFrame === null) {
        pendingProxyConnectionsFrame = scheduleFrame(() => {
          const nextEvent = pendingProxyConnectionsEvent;
          pendingProxyConnectionsEvent = null;
          pendingProxyConnectionsFrame = null;
          if (nextEvent) {
            set((state) => ({
              proxyConnections: nextEvent.payload,
              proxyMonitorStatus: markProxyDataFresh(state.proxyMonitorStatus),
              lastTransientEvent: nextEvent,
            }));
          }
        });
      }
      return;
    }

    set((state) => {
      switch (event.kind) {
        case "logLine":
          return {
            lastTransientEvent: event,
            logLines: [...state.logLines, event.payload].slice(-500),
          };
        case "coreState":
          return { coreState: event.payload, lastTransientEvent: event };
        case "statistics": {
          const payload = parseStatisticsSnapshot(event.payload);
          if (!payload) {
            return {};
          }

          const nextEvent: StatisticsEvent = { kind: "statistics", payload };
          if (!payload.serverStat?.IndexId) {
            return { lastTransientEvent: nextEvent, statistics: payload };
          }

          return {
            lastTransientEvent: nextEvent,
            serverStatsByProfileId: {
              ...state.serverStatsByProfileId,
              [payload.serverStat.IndexId]: payload.serverStat,
            },
            statistics: payload,
          };
        }
        case "sysProxyChanged":
          return { lastTransientEvent: event, sysProxy: event.payload };
        case "tunChanged":
          return { lastTransientEvent: event, tun: event.payload };
        case "proxyMonitorStatus":
          return {
            proxyMonitorStatus: toRuntimeProxyMonitorStatus(event.payload),
            lastTransientEvent: event,
          };
        case "proxyTraffic":
          return {
            proxyMonitorStatus: markProxyDataFresh(state.proxyMonitorStatus),
            proxyTraffic: event.payload,
            lastTransientEvent: event,
          };
        case "speedtestResult":
          return {
            lastTransientEvent: event,
            speedtestResultsByProfileId: {
              ...state.speedtestResultsByProfileId,
              [event.payload.indexId]: event.payload,
            },
          };
      }
    });
  },
  refreshSpeedtestStatus: async () => {
    const status = await speedtestStatus();
    set({ speedtestRunning: status.running });
  },
  setProxyConnections: (proxyConnections) => {
    const payload = parseProxyConnectionsSnapshot(proxyConnections);
    if (payload) {
      set({ proxyConnections: payload });
    }
  },
  setProxyMonitorFailed: (message = null) =>
    set({ proxyMonitorStatus: makeProxyMonitorStatus("failed", false, true, message) }),
  setProxyMonitorRunning: (message = null) =>
    set({ proxyMonitorStatus: makeProxyMonitorStatus("running", true, false, message) }),
  setProxyMonitorStarting: (message = null) =>
    set((state) => ({
      proxyMonitorStatus: makeProxyMonitorStatus("starting", false, state.proxyMonitorStatus.stale, message),
    })),
  setProxyMonitorStatus: (proxyMonitorStatus) =>
    set({ proxyMonitorStatus: toRuntimeProxyMonitorStatus(proxyMonitorStatus) }),
  setProxyMonitorStopped: (message = null) =>
    set({ proxyMonitorStatus: makeProxyMonitorStatus("stopped", false, true, message) }),
  setProxyTraffic: (proxyTraffic) => set({ proxyTraffic }),
  setCoreState: (coreState) => set({ coreState }),
  setSpeedtestRunning: (speedtestRunning) => set({ speedtestRunning }),
  setSpeedtestStatus: (status) => set({ speedtestRunning: status.running }),
  setSysProxy: (sysProxy) => set({ sysProxy }),
  setTun: (tun) => set({ tun }),
  serverStatsByProfileId: {},
  speedtestResultsByProfileId: {},
  speedtestRunning: false,
  statistics: null,
  sysProxy: null,
  tun: null,
}));

function toRuntimeProxyMonitorStatus(status: ProxyMonitorStatus): RuntimeProxyMonitorStatus {
  return {
    message: status.message,
    running: status.running,
    stale: status.stale,
    state: status.state,
  };
}

function makeProxyMonitorStatus(
  state: RuntimeProxyMonitorState,
  running: boolean,
  stale: boolean,
  message: string | null,
): RuntimeProxyMonitorStatus {
  return { message, running, stale, state };
}

function markProxyDataFresh(status: RuntimeProxyMonitorStatus): RuntimeProxyMonitorStatus {
  return { ...status, stale: false };
}

function parseProxyConnectionsSnapshot(payload: unknown): ProxyConnectionsSnapshot | null {
  const result = proxyConnectionsSnapshotSchema.safeParse(payload);
  return result.success ? result.data : null;
}

function parseStatisticsSnapshot(payload: unknown): StatisticsSnapshot | null {
  const result = statisticsSnapshotSchema.safeParse(payload);
  return result.success ? result.data : null;
}

function scheduleFrame(callback: () => void): FrameHandle {
  if (typeof window !== "undefined" && window.requestAnimationFrame) {
    return window.requestAnimationFrame(callback);
  }

  return setTimeout(callback, 16);
}
