import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  readClipboardImageBlob,
  scanDisplayMediaQr,
  scanQrBlob,
} from "./qr-scanner";

const zxingMocks = vi.hoisted(() => ({
  decodeFromImageUrl: vi.fn(),
}));

vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromImageUrl = zxingMocks.decodeFromImageUrl;
  },
}));

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalMediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
const originalCreateObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

let createObjectUrl: ReturnType<typeof vi.fn>;
let revokeObjectUrl: ReturnType<typeof vi.fn>;

beforeEach(() => {
  zxingMocks.decodeFromImageUrl.mockReset();
  createObjectUrl = vi.fn(() => "blob:voya-qr");
  revokeObjectUrl = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreProperty(navigator, "clipboard", originalClipboardDescriptor);
  restoreProperty(navigator, "mediaDevices", originalMediaDevicesDescriptor);
  restoreProperty(URL, "createObjectURL", originalCreateObjectUrlDescriptor);
  restoreProperty(URL, "revokeObjectURL", originalRevokeObjectUrlDescriptor);
});

describe("profile QR scanner", () => {
  it("decodes an image blob and always revokes its object URL", async () => {
    const blob = new Blob(["qr"], { type: "image/png" });
    zxingMocks.decodeFromImageUrl.mockResolvedValue({ getText: () => "  vless://decoded  " });

    await expect(scanQrBlob(blob)).resolves.toBe("vless://decoded");

    expect(createObjectUrl).toHaveBeenCalledWith(blob);
    expect(zxingMocks.decodeFromImageUrl).toHaveBeenCalledWith("blob:voya-qr");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:voya-qr");
  });

  it("reports a missing QR code and still revokes its object URL", async () => {
    zxingMocks.decodeFromImageUrl.mockRejectedValue(new Error("not found"));

    await expect(scanQrBlob(new Blob(["not-a-qr"]))).rejects.toMatchObject({
      name: "QrNotFoundError",
    });

    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:voya-qr");
  });

  it("reads the first image from the clipboard", async () => {
    const image = new Blob(["clipboard-qr"], { type: "image/png" });
    const getType = vi.fn().mockResolvedValue(image);
    const read = vi.fn().mockResolvedValue([
      { getType: vi.fn(), types: ["text/plain"] },
      { getType, types: ["text/plain", "image/png"] },
    ]);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { read },
    });

    await expect(readClipboardImageBlob()).resolves.toBe(image);
    expect(getType).toHaveBeenCalledWith("image/png");
  });

  it("captures a display frame and releases its stream after decoding", async () => {
    vi.useFakeTimers();
    const capturedBlob = new Blob(["screen-qr"], { type: "image/png" });
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia },
    });

    const video = document.createElement("video");
    Object.defineProperties(video, {
      pause: { configurable: true, value: vi.fn() },
      play: { configurable: true, value: vi.fn().mockResolvedValue(undefined) },
      srcObject: { configurable: true, value: null, writable: true },
      videoHeight: { configurable: true, value: 720 },
      videoWidth: { configurable: true, value: 1280 },
    });
    const canvas = document.createElement("canvas");
    const drawImage = vi.fn();
    Object.defineProperties(canvas, {
      getContext: { configurable: true, value: vi.fn(() => ({ drawImage })) },
      toBlob: {
        configurable: true,
        value: vi.fn((callback: BlobCallback) => callback(capturedBlob)),
      },
    });
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(
      ((tagName: string, options?: ElementCreationOptions) => {
        if (tagName === "video") {
          return video;
        }
        if (tagName === "canvas") {
          return canvas;
        }
        return createElement(tagName, options);
      }) as typeof document.createElement,
    );
    zxingMocks.decodeFromImageUrl.mockResolvedValue({ getText: () => "ss://screen" });

    const result = scanDisplayMediaQr();
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe("ss://screen");
    expect(getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true });
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1280, 720);
    expect(stop).toHaveBeenCalledOnce();
    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:voya-qr");
  });
});

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }

  Reflect.deleteProperty(target, property);
}
