import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ipcCommandMocks = vi.hoisted(() => ({
  speedtestStatus: vi.fn(),
}));

vi.mock("@/ipc/commands", () => ipcCommandMocks);

import { useRuntimeEventStore } from "@/ipc/runtime-event-store";
import type { ProxyConnectionsSnapshot, SpeedTestResult, StatisticsSnapshot } from "@/ipc/bindings";

const initialMonitorStatus = {
  message: null,
  running: false,
  stale: true,
  state: "stopped" as const,
};

const cachedConnections: ProxyConnectionsSnapshot = {
  connections: [],
  downloadTotal: 200,
  uploadTotal: 100,
};

describe("runtime event store", () => {
  beforeEach(() => {
    useRuntimeEventStore.setState({
      proxyConnections: null,
      proxyMonitorStatus: initialMonitorStatus,
      proxyTraffic: null,
      lastTransientEvent: null,
      logLines: [],
      serverStatsByProfileId: {},
      speedtestResultsByProfileId: {},
      speedtestRunning: false,
      statistics: null,
    });
    ipcCommandMocks.speedtestStatus.mockReset().mockResolvedValue({ running: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stores proxy traffic websocket events", () => {
    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyTraffic",
      payload: { down: 2048, up: 1024 },
    });

    expect(useRuntimeEventStore.getState().proxyTraffic).toEqual({ down: 2048, up: 1024 });
    expect(useRuntimeEventStore.getState().lastTransientEvent?.kind).toBe("proxyTraffic");
  });

  it("hydrates speedtest running state from the backend status command", async () => {
    ipcCommandMocks.speedtestStatus.mockResolvedValue({ running: true });

    await useRuntimeEventStore.getState().refreshSpeedtestStatus();

    expect(ipcCommandMocks.speedtestStatus).toHaveBeenCalledTimes(1);
    expect(useRuntimeEventStore.getState().speedtestRunning).toBe(true);
  });

  it("sets speedtest running state through store actions", () => {
    useRuntimeEventStore.getState().setSpeedtestRunning(true);

    expect(useRuntimeEventStore.getState().speedtestRunning).toBe(true);

    useRuntimeEventStore.getState().setSpeedtestStatus({ running: false });

    expect(useRuntimeEventStore.getState().speedtestRunning).toBe(false);
  });

  it("stores speedtest result events without ending the running state", () => {
    const result: SpeedTestResult = {
      action: "latency",
      delay: 42,
      indexId: "profile-a",
      ipInfo: "US",
      message: "42",
      speed: null,
    };

    useRuntimeEventStore.getState().setSpeedtestRunning(true);
    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "speedtestResult",
      payload: result,
    });

    expect(useRuntimeEventStore.getState().speedtestResultsByProfileId).toEqual({
      "profile-a": result,
    });
    expect(useRuntimeEventStore.getState().speedtestRunning).toBe(true);
    expect(useRuntimeEventStore.getState().lastTransientEvent?.kind).toBe("speedtestResult");
  });

  it("sets proxy monitor lifecycle state through store actions", () => {
    useRuntimeEventStore.getState().setProxyMonitorRunning();

    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: null,
      running: true,
      stale: false,
      state: "running",
    });

    useRuntimeEventStore.getState().setProxyMonitorStarting("connecting");

    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: "connecting",
      running: false,
      stale: false,
      state: "starting",
    });

    useRuntimeEventStore.getState().setProxyMonitorStopped();

    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: null,
      running: false,
      stale: true,
      state: "stopped",
    });

    useRuntimeEventStore.getState().setProxyMonitorFailed("start failed");

    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: "start failed",
      running: false,
      stale: true,
      state: "failed",
    });
  });

  it("only clears stale state when fresh proxy traffic arrives", () => {
    useRuntimeEventStore.getState().setProxyMonitorFailed("stream failed");

    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyTraffic",
      payload: { down: 2048, up: 1024 },
    });

    expect(useRuntimeEventStore.getState().proxyTraffic).toEqual({ down: 2048, up: 1024 });
    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: "stream failed",
      running: false,
      stale: false,
      state: "failed",
    });
    expect(useRuntimeEventStore.getState().lastTransientEvent?.kind).toBe("proxyTraffic");
  });

  it("does not promote stopped monitor status when late proxy traffic arrives", () => {
    useRuntimeEventStore.getState().setProxyMonitorStopped("monitor stopped");

    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyTraffic",
      payload: { down: 2048, up: 1024 },
    });

    expect(useRuntimeEventStore.getState().proxyTraffic).toEqual({ down: 2048, up: 1024 });
    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: "monitor stopped",
      running: false,
      stale: false,
      state: "stopped",
    });
    expect(useRuntimeEventStore.getState().lastTransientEvent?.kind).toBe("proxyTraffic");
  });

  it("marks stopped monitor status stale while preserving proxy snapshots", () => {
    useRuntimeEventStore.getState().setProxyTraffic({ down: 2048, up: 1024 });
    useRuntimeEventStore.getState().setProxyConnections(cachedConnections);

    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyMonitorStatus",
      payload: { state: "stopped", running: false, stale: true, message: null },
    });

    expect(useRuntimeEventStore.getState().proxyTraffic).toEqual({ down: 2048, up: 1024 });
    expect(useRuntimeEventStore.getState().proxyConnections).toEqual({
      connections: [],
      downloadTotal: 200,
      uploadTotal: 100,
    });
    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: null,
      running: false,
      stale: true,
      state: "stopped",
    });
    expect(useRuntimeEventStore.getState().lastTransientEvent?.kind).toBe("proxyMonitorStatus");
  });

  it("marks failed monitor status stale with a message while preserving proxy snapshots", () => {
    useRuntimeEventStore.getState().setProxyTraffic({ down: 2048, up: 1024 });
    useRuntimeEventStore.getState().setProxyConnections(cachedConnections);

    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyMonitorStatus",
      payload: { state: "failed", running: false, stale: true, message: "monitor failed" },
    });

    expect(useRuntimeEventStore.getState().proxyTraffic).toEqual({ down: 2048, up: 1024 });
    expect(useRuntimeEventStore.getState().proxyConnections).toEqual(cachedConnections);
    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: "monitor failed",
      running: false,
      stale: true,
      state: "failed",
    });
    expect(useRuntimeEventStore.getState().lastTransientEvent?.kind).toBe("proxyMonitorStatus");
  });

  it("coalesces proxy connection websocket events into the next frame", async () => {
    vi.useFakeTimers();

    useRuntimeEventStore.getState().setProxyMonitorFailed("stream failed");

    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyConnections",
      payload: makeConnectionsSnapshot("connection-1", "example.com:443", 200, 100),
    });
    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyConnections",
      payload: makeConnectionsSnapshot("connection-2", "latest.example.com:443", 400, 300, ["Direct"]),
    });

    expect(useRuntimeEventStore.getState().proxyConnections).toBeNull();
    expect(useRuntimeEventStore.getState().proxyMonitorStatus.stale).toBe(true);

    await vi.advanceTimersByTimeAsync(20);

    const snapshot = useRuntimeEventStore.getState().proxyConnections;

    expect(snapshot?.connections[0]?.host).toBe("latest.example.com:443");
    expect(snapshot?.downloadTotal).toBe(400);
    expect(useRuntimeEventStore.getState().proxyMonitorStatus).toEqual({
      message: "stream failed",
      running: false,
      stale: false,
      state: "failed",
    });
    expect(useRuntimeEventStore.getState().lastTransientEvent?.kind).toBe("proxyConnections");
  });

  it("rejects invalid statistics payloads before storing them", () => {
    const invalidStatistics = {
      activeProfileId: "profile-a",
      directDownloadBytesPerSecond: 0,
      directUploadBytesPerSecond: 0,
      downloadBytesPerSecond: 0,
      proxyDownloadBytesPerSecond: 0,
      proxyUploadBytesPerSecond: Number.NaN,
      serverStat: { indexId: "profile-a", totalUp: 1 },
      uploadBytesPerSecond: 0,
    } as StatisticsSnapshot;

    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "statistics",
      payload: invalidStatistics,
    });

    expect(useRuntimeEventStore.getState().statistics).toBeNull();
    expect(useRuntimeEventStore.getState().serverStatsByProfileId).toEqual({});
    expect(useRuntimeEventStore.getState().lastTransientEvent).toBeNull();
  });

  it("does not let invalid proxy connection payloads replace a queued valid frame", async () => {
    vi.useFakeTimers();

    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyConnections",
      payload: makeConnectionsSnapshot("connection-1", "valid.example.com:443", 200, 100),
    });
    useRuntimeEventStore.getState().pushTransientEvent({
      kind: "proxyConnections",
      payload: {
        connections: [],
        downloadTotal: -1,
        uploadTotal: 0,
      } as ProxyConnectionsSnapshot,
    });

    await vi.advanceTimersByTimeAsync(20);

    expect(useRuntimeEventStore.getState().proxyConnections?.connections[0]?.host).toBe("valid.example.com:443");
    expect(useRuntimeEventStore.getState().proxyConnections?.downloadTotal).toBe(200);
    expect(useRuntimeEventStore.getState().lastTransientEvent?.kind).toBe("proxyConnections");
  });
});

function makeConnectionsSnapshot(
  id: string,
  host: string,
  downloadTotal: number,
  uploadTotal: number,
  chains = ["Proxy"],
): ProxyConnectionsSnapshot {
  return {
    connections: [
      {
        chains,
        connectionType: "HTTP",
        destination: "93.184.216.34:443",
        download: downloadTotal,
        host,
        id,
        network: "tcp",
        process: "browser",
        processPath: "/usr/bin/browser",
        rule: "MATCH",
        rulePayload: null,
        source: "127.0.0.1:53000",
        start: "2026-06-01T00:00:00Z",
        upload: uploadTotal,
      },
    ],
    downloadTotal,
    uploadTotal,
  };
}
