import logo from "@/assets/logo.svg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OWNER_NAME, TELEGRAM_CHANNEL, TOOL_NAME, triggerDownload } from "@/lib/libreader";
import {
  DEFAULT_IMAGE_OPTIONS,
  PIXEL_FORMATS,
  buildImageHeader,
  formatByteCount,
  prepareImage,
  packPixels,
  type ImageHeaderOptions,
  type PixelFormat,
  type PreparedImage,
} from "@/lib/imageHeader";
import { motion } from "framer-motion";
import {
  Braces,
  Copy,
  Download,
  FileImage,
  Image as ImageIcon,
  LayoutDashboard,
  Loader2,
  RotateCcw,
  Sparkles,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

interface Conversion {
  image: PreparedImage;
  header: ReturnType<typeof buildImageHeader>;
  bytes: number;
}

export default function ImageTool() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [options, setOptions] = useState<ImageHeaderOptions>(DEFAULT_IMAGE_OPTIONS);
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const patch = (next: Partial<ImageHeaderOptions>) =>
    setOptions((prev) => ({ ...prev, ...next }));

  const convert = async (file: File) => {
    setBusy(true);
    try {
      const image = await prepareImage(file, options);
      const packed = packPixels(image, options.format);
      const header = buildImageHeader(image, packed, options, file.name);
      setConversion({ image, header, bytes: packed.length });
      setSourceName(file.name);
      toast.success(`${file.name} converted`, {
        description: `${image.width}×${image.height} · ${formatByteCount(packed.length)} · ${header.fileName}`,
      });
    } catch (error) {
      toast.error("Could not convert that image", {
        description: error instanceof Error ? error.message : "Unsupported file",
      });
    } finally {
      setBusy(false);
    }
  };

  const reconvert = () => {
    if (!conversion) return;
    const packed = packPixels(conversion.image, options.format);
    const header = buildImageHeader(conversion.image, packed, options, sourceName || "image");
    setConversion({ ...conversion, header, bytes: packed.length });
    toast.success(`Re-packed as ${options.format}`, {
      description: `${formatByteCount(packed.length)} · ${header.fileName}`,
    });
  };

  const copyHeader = async () => {
    if (!conversion) return;
    try {
      await navigator.clipboard.writeText(conversion.header.content);
      toast.success("Header copied to the clipboard");
    } catch {
      toast.error("The clipboard is blocked here — use Download instead");
    }
  };

  const reset = () => {
    setConversion(null);
    setSourceName("");
    setOptions(DEFAULT_IMAGE_OPTIONS);
  };

  return (
    <div className="min-h-screen bg-background bg-radial-gold">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-3" aria-label="Back to home">
            <img src={logo} alt="LUCKY HUB" width={34} height={34} className="rounded-lg" />
            <span className="text-left">
              <span className="block font-display text-sm leading-tight tracking-wide text-gold">
                {TOOL_NAME}
              </span>
              <span className="hidden font-mono text-[10px] leading-tight text-muted-foreground sm:block">
                {OWNER_NAME} · {TELEGRAM_CHANNEL}
              </span>
            </span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/tool")}>
              <Sparkles />
              Lib reader
            </Button>
            <Button size="sm" onClick={() => navigate("/dashboard")}>
              <LayoutDashboard />
              Workspace
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="rounded-xl border border-gold-soft bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-center gap-2">
            <ImageIcon className="size-4 text-primary" />
            <h1 className="font-display text-xl tracking-wide sm:text-2xl">Image → .h converter</h1>
            <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
              runs offline
            </Badge>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">
            Drop any PNG, JPG, WebP, GIF or BMP and get a ready-to-link C header with the pixel array in
            RGB565, RGB888, ARGB8888 or 8-bit grayscale. Perfect for ST77xx / ILI9341 / SSD1306 firmware —
            resize, re-pack and download without a single upload.
          </p>
        </motion.div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          {/* ---------- drop zone + preview ---------- */}
          <div className="flex flex-col gap-4">
            <Card className="border-border/70 shadow-none">
              <CardContent className="p-0">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void convert(file);
                  }}
                  onClick={() => inputRef.current?.click()}
                  className={
                    "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors " +
                    (dragging
                      ? "border-primary bg-primary/10"
                      : "border-border/80 bg-card/40 hover:border-gold-soft hover:bg-primary/5")
                  }
                >
                  <div className="flex size-14 items-center justify-center rounded-full border border-gold-soft bg-primary/10">
                    {busy ? (
                      <Loader2 className="size-6 animate-spin text-primary" />
                    ) : (
                      <Upload className="size-6 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-display text-base tracking-wide">
                      {busy ? "Converting…" : conversion ? "Drop another image" : "Drop your image here"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PNG · JPG · WebP · GIF · BMP — nothing leaves your browser
                    </p>
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void convert(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="font-display text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {conversion ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center rounded-lg border border-border/60 bg-grid p-3">
                      <img
                        src={conversion.image.previewUrl}
                        alt="Converted preview"
                        className="max-h-72 w-auto max-w-full rounded border border-border/60"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { k: "Output", v: `${conversion.image.width}×${conversion.image.height}` },
                        {
                          k: "Source",
                          v: `${conversion.image.originalWidth}×${conversion.image.originalHeight}`,
                        },
                        { k: "Array", v: formatByteCount(conversion.bytes) },
                        { k: "Pixels", v: conversion.header.pixelCount.toLocaleString() },
                      ].map((s) => (
                        <div key={s.k} className="rounded-lg border border-border/70 bg-card/50 p-2.5">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.k}</p>
                          <p className="mt-0.5 truncate font-mono text-xs">{s.v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileImage className="size-3.5 text-primary" />
                    The resized result and its pixel statistics appear here after the first conversion.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ---------- options + output ---------- */}
          <div className="flex flex-col gap-4">
            <Card className="border-gold-soft shadow-none">
              <CardHeader>
                <CardTitle className="font-display text-base">Output options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="font-mono text-[11px] text-muted-foreground">symbol name</Label>
                  <Input
                    value={options.symbol}
                    onChange={(e) => patch({ symbol: e.target.value })}
                    placeholder="luckyhub_image"
                    className="mt-1 h-9 font-mono text-xs"
                  />
                </div>

                <div>
                  <Label className="font-mono text-[11px] text-muted-foreground">pixel format</Label>
                  <Select
                    value={options.format}
                    onValueChange={(value) => patch({ format: value as PixelFormat })}
                  >
                    <SelectTrigger className="mt-1 h-9 font-mono text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIXEL_FORMATS.map((f) => (
                        <SelectItem key={f.id} value={f.id} className="font-mono text-xs">
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                    {PIXEL_FORMATS.find((f) => f.id === options.format)?.hint}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="font-mono text-[11px] text-muted-foreground">max size (px)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={4096}
                      value={options.maxWidth}
                      onChange={(e) => patch({ maxWidth: Number(e.target.value) || 0 })}
                      className="mt-1 h-9 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <Label className="font-mono text-[11px] text-muted-foreground">values / line</Label>
                    <Input
                      type="number"
                      min={4}
                      max={32}
                      value={options.perLine}
                      onChange={(e) => patch({ perLine: Number(e.target.value) || 16 })}
                      className="mt-1 h-9 font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <Label className="font-mono text-[11px] text-muted-foreground">transparent backdrop</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={options.background}
                      onChange={(e) => patch({ background: e.target.value })}
                      className="h-9 w-14 cursor-pointer rounded border border-border/70 bg-background"
                      aria-label="Backdrop colour"
                    />
                    <Input
                      value={options.background}
                      onChange={(e) => patch({ background: e.target.value })}
                      className="h-9 flex-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" onClick={reconvert} disabled={!conversion || busy}>
                    <RotateCcw />
                    Re-pack with these settings
                  </Button>
                  {conversion && (
                    <Button variant="ghost" onClick={reset}>
                      Clear
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Braces className="size-4 text-primary" />
                  Header output
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {conversion ? (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() =>
                          triggerDownload(
                            conversion.header.fileName,
                            conversion.header.content,
                            "text/plain",
                          )
                        }
                        className="gold-glow"
                      >
                        <Download />
                        Download .h
                      </Button>
                      <Button variant="outline" onClick={() => void copyHeader()}>
                        <Copy />
                        Copy
                      </Button>
                      <Badge variant="outline" className="ml-auto self-center font-mono text-[10px]">
                        {conversion.header.fileName}
                      </Badge>
                    </div>
                    <pre className="terminal-scroll max-h-80 overflow-auto rounded-md border border-border/60 bg-background/60 p-3 font-mono text-[10px] leading-4">
                      {conversion.header.content
                        .split("\n")
                        .slice(0, 60)
                        .join("\n")}
                    </pre>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Convert an image to generate the header — the first lines are previewed here.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/60 px-6 py-5 text-center">
        <p className="font-mono text-[11px] text-muted-foreground">
          {TOOL_NAME} · {OWNER_NAME} · Telegram{" "}
          <a
            href="https://t.me/LUCKY_HUB_DEV"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline-offset-4 hover:underline"
          >
            {TELEGRAM_CHANNEL}
          </a>
        </p>
      </footer>
    </div>
  );
}
