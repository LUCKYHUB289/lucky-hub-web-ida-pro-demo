/**
 * Screenshot capture for feedback and direct messages.
 *
 * Uses snapdom (already in the stack) to rasterise a DOM subtree in the
 * browser, then downscales it to a small JPEG data URL so it comfortably fits
 * through Convex function arguments and Telegram's sendPhoto endpoint.
 */

import { snapdom } from "@zumer/snapdom";

/** DOM id the workbench/workspace puts on the region that gets screenshotted. */
export const CAPTURE_ELEMENT_ID = "luckyhub-capture";

const MAX_WIDTH = 860;
const MAX_HEIGHT = 1600;
const JPEG_QUALITY = 0.72;

export interface ScreenshotResult {
  /** `data:image/jpeg;base64,...` — ready to upload or preview. */
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

function fitWithin(width: number, height: number) {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Captures `element` and returns a downscaled JPEG data URL.
 * Resolves to `null` when capture is not possible (no element, blocked, etc.)
 * so callers can safely send feedback without a screenshot.
 */
export async function captureScreenshot(element: Element | null): Promise<ScreenshotResult | null> {
  if (!element || typeof document === "undefined") return null;
  try {
    const capture = await snapdom(element, { fast: true, scale: 1 });
    const source = await capture.toCanvas();
    const target = fitWithin(source.width, source.height);

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Dark backing so transparent regions don't turn into white blocks.
    ctx.fillStyle = "#0b0b0c";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0, target.width, target.height);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const base64 = dataUrl.split(",", 2)[1] ?? "";
    return {
      dataUrl,
      width: target.width,
      height: target.height,
      bytes: Math.round((base64.length * 3) / 4),
    };
  } catch (error) {
    console.warn("[LUCKY HUB] screenshot capture failed:", error);
    return null;
  }
}

/** Drops the `data:image/...;base64,` prefix — Telegram wants raw base64. */
export function stripDataUrl(dataUrl: string): string {
  return dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
}

/** Strips `data:` prefix and returns just the mime type (defaults to jpeg). */
export function dataUrlMime(dataUrl: string): string {
  const match = /^data:([^;]+);/.exec(dataUrl);
  return match?.[1] ?? "image/jpeg";
}
