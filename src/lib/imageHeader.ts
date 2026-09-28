/**
 * IMAGE → .h CONVERTER
 * --------------------
 * Turns any browser-decodable image into a C header with a ready-to-link pixel
 * array — the format embedded display drivers (ST77xx, ILI9341, SSD1306 …)
 * expect. Everything runs in the browser: no uploads, no server round-trip.
 */

import { OWNER_NAME, TELEGRAM_CHANNEL, TOOL_NAME } from "@/lib/libreader";

export type PixelFormat = "rgb565" | "rgb565be" | "rgb888" | "argb8888" | "gray8";

export interface PixelFormatSpec {
  id: PixelFormat;
  label: string;
  cType: string;
  bytesPerPixel: number;
  hint: string;
}

export const PIXEL_FORMATS: PixelFormatSpec[] = [
  {
    id: "rgb565",
    label: "RGB565 (little-endian)",
    cType: "uint16_t",
    bytesPerPixel: 2,
    hint: "16-bit colour packed lo|hi — TFT_eSPI, LovyanGFX, most SPI panels",
  },
  {
    id: "rgb565be",
    label: "RGB565 (big-endian / swapped)",
    cType: "uint16_t",
    bytesPerPixel: 2,
    hint: "High byte first — use when the panel wants swapped bytes",
  },
  {
    id: "rgb888",
    label: "RGB888",
    cType: "uint8_t",
    bytesPerPixel: 3,
    hint: "24-bit true colour, one byte per channel",
  },
  {
    id: "argb8888",
    label: "ARGB8888",
    cType: "uint32_t",
    bytesPerPixel: 4,
    hint: "32-bit with alpha — framebuffers, SDL, LVGL true-colour",
  },
  {
    id: "gray8",
    label: "Grayscale 8-bit",
    cType: "uint8_t",
    bytesPerPixel: 1,
    hint: "Luma only — OLED / e-paper / SD1306 style displays",
  },
];

export interface ImageHeaderOptions {
  symbol: string;
  format: PixelFormat;
  /** Longest edge is scaled down to this; 0 keeps the original size. */
  maxWidth: number;
  /** CSS colour painted behind transparent pixels. */
  background: string;
  /** Values per output line. */
  perLine: number;
}

export const DEFAULT_IMAGE_OPTIONS: ImageHeaderOptions = {
  symbol: "luckyhub_image",
  format: "rgb565",
  maxWidth: 240,
  background: "#000000",
  perLine: 16,
};

export interface PreparedImage {
  width: number;
  height: number;
  /** Resized RGBA pixels. */
  data: Uint8ClampedArray;
  previewUrl: string;
  originalWidth: number;
  originalHeight: number;
}

export function cIdentifier(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/^_+/, "");
  if (!cleaned) return "image_data";
  return /^[0-9]/.test(cleaned) ? `img_${cleaned}` : cleaned;
}

function cssToRgb(color: string): { r: number; g: number; b: number } {
  const hex = color.trim().replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex[0] + hex[0], 16),
      g: Number.parseInt(hex[1] + hex[1], 16),
      b: Number.parseInt(hex[2] + hex[2], 16),
    };
  }
  return { r: 0, g: 0, b: 0 };
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to the <img> path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("That file could not be decoded as an image."));
      img.src = url;
    });
    return img;
  } finally {
    // The bitmap is fully decoded by now, so the object URL can go.
    URL.revokeObjectURL(url);
  }
}

/** Decodes + resizes an image and returns the pixels plus a preview URL. */
export async function prepareImage(
  file: File | Blob,
  options: Pick<ImageHeaderOptions, "maxWidth" | "background">,
): Promise<PreparedImage> {
  const bitmap = await loadBitmap(file);
  const originalWidth = "width" in bitmap ? bitmap.width : 0;
  const originalHeight = "height" in bitmap ? bitmap.height : 0;
  if (!originalWidth || !originalHeight) {
    throw new Error("The image reported a zero size.");
  }

  const scale =
    options.maxWidth > 0 ? Math.min(1, options.maxWidth / Math.max(originalWidth, originalHeight)) : 1;
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable in this browser.");

  // Paint the backdrop first so transparency resolves to a deterministic colour.
  const { r, g, b } = cssToRgb(options.background);
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const previewUrl = canvas.toDataURL("image/png");

  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  return {
    width,
    height,
    data: imageData.data,
    previewUrl,
    originalWidth,
    originalHeight,
  };
}

function clamp255(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

/** Packs prepared RGBA pixels into the requested on-wire pixel format. */
export function packPixels(image: PreparedImage, format: PixelFormat): Uint8Array {
  const { data } = image;
  const count = image.width * image.height;
  const spec = PIXEL_FORMATS.find((f) => f.id === format) ?? PIXEL_FORMATS[0];
  const out = new Uint8Array(count * spec.bytesPerPixel);
  let o = 0;

  for (let i = 0; i < count; i++) {
    const p = i * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const a = data[p + 3];

    switch (format) {
      case "rgb565":
      case "rgb565be": {
        const value =
          ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | ((b & 0xf8) >> 3);
        if (format === "rgb565") {
          out[o++] = value & 0xff;
          out[o++] = (value >> 8) & 0xff;
        } else {
          out[o++] = (value >> 8) & 0xff;
          out[o++] = value & 0xff;
        }
        break;
      }
      case "rgb888": {
        out[o++] = r;
        out[o++] = g;
        out[o++] = b;
        break;
      }
      case "argb8888": {
        out[o++] = b;
        out[o++] = g;
        out[o++] = r;
        out[o++] = a;
        break;
      }
      case "gray8":
      default: {
        out[o++] = clamp255(0.299 * r + 0.587 * g + 0.114 * b);
        break;
      }
    }
  }
  return out;
}

function hexByte(value: number): string {
  return `0x${value.toString(16).padStart(2, "0").toUpperCase()}`;
}

function hexWord(value: number): string {
  return `0x${value.toString(16).padStart(4, "0").toUpperCase()}`;
}

export interface HeaderResult {
  fileName: string;
  content: string;
  bytes: number;
  width: number;
  height: number;
  pixelCount: number;
}

/** Builds the complete `.h` text for the given pixels. */
export function buildImageHeader(
  image: PreparedImage,
  bytes: Uint8Array,
  options: ImageHeaderOptions,
  sourceName: string,
): HeaderResult {
  const symbol = cIdentifier(options.symbol);
  const spec = PIXEL_FORMATS.find((f) => f.id === options.format) ?? PIXEL_FORMATS[0];
  const perLine = Math.min(Math.max(options.perLine || 16, 4), 32);
  const guard = `LUCKYHUB_${symbol.toUpperCase()}_H`;

  const lines: string[] = [];
  lines.push(`#ifndef ${guard}`);
  lines.push(`#define ${guard}`);
  lines.push("");
  lines.push("/*");
  lines.push(` * ${TOOL_NAME} — image to header`);
  lines.push(` * Owner     : ${OWNER_NAME}`);
  lines.push(` * Telegram  : ${TELEGRAM_CHANNEL}`);
  lines.push(` * Source    : ${sourceName}`);
  lines.push(` * Generated : ${new Date().toISOString()}`);
  lines.push(" */");
  lines.push("");
  lines.push("#include <stdint.h>");
  lines.push("");
  lines.push(`#define ${symbol.toUpperCase()}_WIDTH  ${image.width}`);
  lines.push(`#define ${symbol.toUpperCase()}_HEIGHT ${image.height}`);
  lines.push(`#define ${symbol.toUpperCase()}_FORMAT_${spec.id.toUpperCase()}`);
  lines.push(`#define ${symbol.toUpperCase()}_BYTES_PER_PIXEL ${spec.bytesPerPixel}`);
  lines.push(`#define ${symbol.toUpperCase()}_BYTE_LENGTH ${bytes.length}`);
  lines.push("");
  lines.push(
    `/* ${image.originalWidth}×${image.originalHeight} source → ${image.width}×${image.height} · ${spec.label} */`,
  );
  lines.push(`static const ${spec.cType} ${symbol}[${bytes.length}] = {`);

  const isWord = spec.bytesPerPixel === 2 || spec.bytesPerPixel === 4;
  for (let i = 0; i < bytes.length; i += spec.bytesPerPixel * perLine) {
    const row: string[] = [];
    for (let j = 0; j < perLine; j++) {
      const at = i + j * spec.bytesPerPixel;
      if (at + spec.bytesPerPixel > bytes.length) break;
      if (isWord) {
        let value = 0;
        for (let k = 0; k < spec.bytesPerPixel; k++) value |= bytes[at + k] << (8 * k);
        row.push(hexWord(value));
      } else {
        row.push(hexByte(bytes[at]));
      }
    }
    const pixelIndex = Math.floor(i / spec.bytesPerPixel);
    lines.push(`  ${row.join(", ")}, /* px ${pixelIndex} */`);
  }

  lines.push("};");
  lines.push("");
  lines.push(`#endif /* ${guard} */`);
  lines.push("");

  return {
    fileName: `${symbol}.h`,
    content: lines.join("\n"),
    bytes: bytes.length,
    width: image.width,
    height: image.height,
    pixelCount: image.width * image.height,
  };
}

/** Rough memory cost of the generated array, for the UI summary. */
export function formatByteCount(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}
