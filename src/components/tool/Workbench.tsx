import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hasBackend, useNotify } from "@/lib/backend";
import { readVisitorId } from "@/lib/prefs";
import { CAPTURE_ELEMENT_ID, captureScreenshot } from "@/lib/screenshot";
import { cn } from "@/lib/utils";
import {
  EXPORT_FORMATS,
  applyPatches,
  bytesToHexDumpPreview,
  bytesToHexDumpTail,
  crc32,
  entropyOf,
  exportDump,
  extractStrings,
  fnv1a32,
  formatBytes,
  hex,
  hexPad,
  parseLib,
  parsePattern,
  searchPattern,
  triggerDownload,
  TOOL_NAME,
  OWNER_NAME,
  type BytePatch,
  type ExportFormat,
  type ParsedLib,
} from "@/lib/libreader";
import {
  Binary,
  Boxes,
  Braces,
  Camera,
  Cpu,
  Download,
  FileCode2,
  FileUp,
  Fingerprint,
  Hammer,
  Hash,
  Info,
  Layers,
  Loader2,
  PackageOpen,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DisasmPanel } from "./DisasmPanel";
import { HexViewer } from "./HexViewer";
import { SignaturePanel } from "./SignaturePanel";
import { StringsPanel } from "./StringsPanel";
import { SymbolsPanel } from "./SymbolsPanel";

interface WorkbenchProps {
  userName: string;
  userEmail: string;
}

const TAB_ITEMS = [
  { value: "overview", label: "Lib info", icon: Layers },
  { value: "sections", label: "Sections", icon: PackageOpen },
  { value: "symbols", label: "Symbols", icon: Hash },
  { value: "strings", label: "Strings", icon: Braces },
  { value: "hex", label: "Hex + Editor", icon: TerminalSquare },
  { value: "disasm", label: "Disassembly", icon: Cpu },
  { value: "signature", label: "Signatures", icon: Sparkles },
  { value: "export", label: "Export", icon: Download },
];

export function Workbench({ userName, userEmail }: WorkbenchProps) {
  const notify = useNotify();

  const [lib, setLib] = useState<ParsedLib | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState("overview");
  const [focusOffset, setFocusOffset] = useState<number | null>(null);

  const [patches, setPatches] = useState<BytePatch[]>([]);
  const [patchOffset, setPatchOffset] = useState("");
  const [patchHex, setPatchHex] = useState("");

  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const [patternInput, setPatternInput] = useState("");
  const [patternError, setPatternError] = useState<string | null>(null);
  const [matches, setMatches] = useState<number[]>([]);

  const [format, setFormat] = useState<ExportFormat>("txt");
  const [includeSections, setIncludeSections] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [includeSegments, setIncludeSegments] = useState(true);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* ---------------- deep info analysis (memoised per lib) ---------------- */

  const forensics = useMemo(() => {
    if (!lib) return null;
    const bytes = lib.bytes;
    return {
      crc: crc32(bytes),
      fnv: fnv1a32(bytes),
      entropy: entropyOf(bytes),
      strings: extractStrings(bytes, { minLength: 4, limit: 4000 }),
    };
  }, [lib]);

  const [sha256, setSha256] = useState<string | null>(null);
  useEffect(() => {
    if (!lib || typeof crypto === "undefined" || !crypto.subtle) {
      setSha256(null);
      return;
    }
    let cancelled = false;
    const bytes = new Uint8Array(lib.bytes);
    crypto.subtle
      .digest("SHA-256", bytes)
      .then((digest) => {
        if (cancelled) return;
        setSha256(
          Array.from(new Uint8Array(digest))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""),
        );
      })
      .catch(() => {
        if (!cancelled) setSha256(null);
      });
    return () => {
      cancelled = true;
    };
  }, [lib]);

  /* ---------------- notifications ---------------- */

  /** Grabs a screenshot of the capture region, or nothing if it isn't available. */
  const screenshotPayload = async (): Promise<{
    screenshot?: string;
    screenshotWidth?: number;
    screenshotHeight?: number;
  }> => {
    const target = document.getElementById(CAPTURE_ELEMENT_ID) ?? rootRef.current;
    const shot = await captureScreenshot(target ?? null);
    if (!shot) return {};
    return {
      screenshot: shot.dataUrl,
      screenshotWidth: shot.width,
      screenshotHeight: shot.height,
    };
  };

  /** Manual report to the owner: always tries to attach a screenshot. */
  const sendWorkbenchReport = async () => {
    if (!hasBackend) {
      toast.error("Reporting needs a connected backend");
      return;
    }
    const shot = await screenshotPayload();
    const summary = lib
      ? `${fileName || "unnamed"} · ${lib.format} ${lib.arch} · ${lib.symbols.length} symbols · ${formatBytes(lib.bytes.length)}`
      : "No lib loaded in the workbench yet.";
    try {
      const result = await notify({
        kind: "feedback",
        message: `Quick report sent from the workbench.\n\n${summary}`,
        screen: "Workbench · quick report",
        userName: userName || undefined,
        userEmail: userEmail || undefined,
        visitorId: readVisitorId(),
        fileName: fileName || undefined,
        fileSize: fileSize || undefined,
        format: lib?.format,
        arch: lib?.arch,
        bits: lib?.bits,
        symbolCount: lib?.symbols.length,
        sectionCount: lib?.sections.length,
        ...shot,
      });
      if (result.ok) {
        toast.success("Report delivered to the owner", {
          description: shot.screenshot
            ? `Screenshot attached (${shot.screenshotWidth}×${shot.screenshotHeight}).`
            : "Sent without a screenshot.",
        });
      } else {
        toast.error("Could not reach the owner", { description: result.error ?? undefined });
      }
    } catch (error) {
      toast.error("Could not reach the owner", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  /* ---------------- file loading ---------------- */

  const loadFile = async (file: File) => {
    setParsing(true);
    try {
      const buffer = await file.arrayBuffer();
      // let the spinner paint before the (synchronous) parse blocks the thread
      await new Promise((resolve) => setTimeout(resolve, 16));
      const bytes = new Uint8Array(buffer);
      const parsed = parseLib(bytes);
      setLib(parsed);
      setFileName(file.name);
      setFileSize(file.size);
      setPatches([]);
      setOverrides({});
      setMatches([]);
      setPatternError(null);
      setFocusOffset(null);
      setTab("overview");
      toast.success(`${file.name} analysed`, {
        description: `${parsed.format} · ${parsed.arch} · ${parsed.symbols.length.toLocaleString()} symbols · ${parsed.sections.length} sections`,
      });
    } catch (error) {
      toast.error("Could not read that file", {
        description: error instanceof Error ? error.message : "Unknown read error",
      });
    } finally {
      setParsing(false);
    }
  };

  /* ---------------- export ---------------- */

  const buildExport = (fmt: ExportFormat) =>
    exportDump(lib!, {
      format: fmt,
      userName,
      userEmail,
      fileName,
      includeSections,
      includeSymbols,
      includeSegments,
      labelOverrides: overrides,
    });

  const download = (fmt: ExportFormat) => {
    if (!lib) return;
    const spec = EXPORT_FORMATS.find((f) => f.id === fmt)!;
    const { fileName: outName, content, mime } = buildExport(fmt);
    triggerDownload(outName, content, mime);
    toast.success(`${spec.label} exported`, { description: outName });
  };

  const downloadEverything = async () => {
    if (!lib) return;
    setBusy(true);
    try {
      for (const spec of EXPORT_FORMATS) {
        const { fileName: outName, content, mime } = buildExport(spec.id);
        triggerDownload(outName, content, mime);
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      toast.success("Full dump downloaded — every format", {
        description: "Check your downloads folder.",
      });
    } finally {
      setBusy(false);
    }
  };

  const downloadPatchedLib = () => {
    if (!lib) return;
    const result = applyPatches(lib.bytes, patches);
    if (result.errors.length > 0) {
      toast.error("Some patches were rejected", { description: result.errors.join(" · ") });
    }
    if (result.applied === 0) {
      toast.error("Nothing to write — add a patch first");
      return;
    }
    const blob = new Blob([result.bytes as unknown as BlobPart], {
      type: "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName || "lib"}.patched`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast.success(`Patched lib written (${result.applied} edit${result.applied === 1 ? "" : "s"})`);
  };

  /* ---------------- patches ---------------- */

  const addPatch = () => {
    const parsed = parsePattern(patchHex);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    const offset = Number.parseInt(patchOffset.trim().replace(/^0x/i, ""), 16);
    if (Number.isNaN(offset)) {
      toast.error("Patch offset must be hex, e.g. 1A2B3C");
      return;
    }
    if (parsed.tokens.length === 0) {
      toast.error("Enter the replacement bytes, e.g. C0 03 5F D6");
      return;
    }
    setPatches((prev) => [...prev, { offset, hex: patchHex.trim() }]);
    setPatchHex("");
    toast.success(`Patch queued @ ${hex(offset)}`);
  };

  /* ---------------- pattern search ---------------- */

  const runSearch = () => {
    if (!lib) return;
    const parsed = parsePattern(patternInput);
    if (parsed.error) {
      setPatternError(parsed.error);
      setMatches([]);
      return;
    }
    setPatternError(null);
    const found = searchPattern(lib.bytes, parsed, 1000);
    setMatches(found.map((m) => m.offset));
    toast.success(
      found.length === 0 ? "No match in this lib" : `${found.length} match(es) found`,
    );
  };

  /* ---------------- render ---------------- */

  if (!lib) {
    return (
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
              if (file) void loadFile(file);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed px-6 py-20 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/10"
                : "border-border/80 bg-card/40 hover:border-gold-soft hover:bg-primary/5",
            )}
          >
            <div className="flex size-16 items-center justify-center rounded-full border border-gold-soft bg-primary/10">
              {parsing ? (
                <Loader2 className="size-7 animate-spin text-primary" />
              ) : (
                <FileUp className="size-7 text-primary" />
              )}
            </div>
            <div>
              <p className="font-display text-lg tracking-wide">
                {parsing ? "Reading the lib…" : "Drop your lib here"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                .dylib · .so · .a · .elf · Mach-O universal · PE · or any raw blob
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                parsed 100% offline
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                nothing uploaded
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                one-click dump
              </Badge>
            </div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void loadFile(file);
                e.target.value = "";
              }}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  const stats: { label: string; value: string; icon: typeof Cpu }[] = [
    { label: "Format", value: lib.format, icon: PackageOpen },
    { label: "Architecture", value: `${lib.arch} (${lib.bits}-bit)`, icon: Cpu },
    { label: "Endianness", value: lib.endian, icon: Braces },
    {
      label: "File size",
      value: `${formatBytes(lib.bytes.length)} · ${lib.bytes.length.toLocaleString()} B`,
      icon: Binary,
    },
    { label: "Entry point", value: hex(lib.entry), icon: Hash },
    { label: "Image base", value: hex(lib.imageBase), icon: Layers },
    { label: "Symbols", value: lib.symbols.length.toLocaleString(), icon: Hash },
    { label: "Sections", value: String(lib.sections.length), icon: PackageOpen },
    { label: "Segments", value: String(lib.segments.length), icon: Boxes },
    { label: "Imports", value: lib.imports.length.toLocaleString(), icon: Download },
    { label: "Exports", value: lib.exports.length.toLocaleString(), icon: Sparkles },
    {
      label: "Strings ≥ 4",
      value: forensics ? forensics.strings.length.toLocaleString() : "…",
      icon: Search,
    },
  ];

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {/* action bar */}
      <div className="flex flex-col gap-3 rounded-lg border border-gold-soft bg-gradient-to-br from-primary/10 via-card to-card p-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate font-mono text-sm text-primary">
            <FileCode2 className="size-4 shrink-0" />
            <span className="truncate">{fileName}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {lib.format} · {lib.arch} · {formatBytes(fileSize)} ·{" "}
            {lib.symbols.length.toLocaleString()} symbols · {patches.length} patch
            {patches.length === 1 ? "" : "es"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <FileUp />
            Change lib
          </Button>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadFile(file);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={!hasBackend}
            onClick={() => void sendWorkbenchReport()}
            title={
              hasBackend
                ? "Send this lib to the owner with a screenshot"
                : "Connect a backend to reach the owner"
            }
          >
            <Camera />
            Report + screenshot
          </Button>
          <Button size="lg" disabled={busy} onClick={() => void downloadEverything()} className="gold-glow">
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            One-click dump everything
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg p-1.5">
          {TAB_ITEMS.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="flex-none gap-1.5 px-3 py-1.5">
              <item.icon className="size-3.5" />
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-lg border border-border/70 bg-card/50 p-3">
                <s.icon className="size-4 text-primary" />
                <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {s.label}
                </p>
                <p className="truncate font-mono text-sm" title={s.value}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Info className="size-4 text-primary" />
                  Container header — every field
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {lib.fields.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No container header was recognised — this may be a raw blob.
                  </p>
                ) : (
                  lib.fields.map((f) => (
                    <div
                      key={f.key}
                      className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5 last:border-0"
                    >
                      <span className="font-mono text-xs text-muted-foreground">{f.key}</span>
                      <span
                        className="max-w-[65%] truncate font-mono text-xs text-accent"
                        title={f.value}
                      >
                        {f.value}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Fingerprint className="size-4 text-primary" />
                  Fingerprints, entropy &amp; counts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {[
                  { k: "file name", v: fileName || "unnamed" },
                  {
                    k: "file size",
                    v: `${lib.bytes.length.toLocaleString()} bytes · ${formatBytes(lib.bytes.length)}`,
                  },
                  { k: "endianness", v: lib.endian },
                  { k: "bits", v: `${lib.bits}-bit` },
                  { k: "CRC-32", v: forensics ? `0x${hexPad(forensics.crc, 8).toUpperCase()}` : "computing…" },
                  { k: "FNV-1a 32", v: forensics ? `0x${hexPad(forensics.fnv, 8).toUpperCase()}` : "computing…" },
                  { k: "SHA-256", v: sha256 ? sha256.toUpperCase() : "computing…" },
                  {
                    k: "entropy",
                    v: forensics ? `${forensics.entropy.toFixed(3)} bits/byte` : "computing…",
                  },
                  {
                    k: "strings ≥ 4 chars",
                    v: forensics ? forensics.strings.length.toLocaleString() : "computing…",
                  },
                  { k: "segments / sections", v: `${lib.segments.length} / ${lib.sections.length}` },
                  { k: "symbols", v: lib.symbols.length.toLocaleString() },
                  { k: "imports / exports", v: `${lib.imports.length} / ${lib.exports.length}` },
                ].map((r) => (
                  <div
                    key={r.k}
                    className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5 last:border-0"
                  >
                    <span className="font-mono text-xs text-muted-foreground">{r.k}</span>
                    <span
                      className="max-w-[65%] truncate font-mono text-xs text-accent"
                      title={r.v}
                    >
                      {r.v}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Download className="size-4 text-primary" />
                  Imports
                  <span className="font-mono text-xs text-muted-foreground">
                    ({lib.imports.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {lib.imports.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This container declares no imported symbols.
                  </p>
                ) : (
                  lib.imports.slice(0, 120).map((name, i) => (
                    <Badge key={`${name}-${i}`} variant="outline" className="font-mono text-[10px]">
                      {name}
                    </Badge>
                  ))
                )}
                {lib.imports.length > 120 && (
                  <p className="text-[11px] text-muted-foreground">
                    + {lib.imports.length - 120} more…
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Sparkles className="size-4 text-primary" />
                  Exports
                  <span className="font-mono text-xs text-muted-foreground">
                    ({lib.exports.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {lib.exports.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No exported symbols were found in this container.
                  </p>
                ) : (
                  lib.exports.slice(0, 120).map((name, i) => (
                    <Badge key={`${name}-${i}`} variant="secondary" className="font-mono text-[10px]">
                      {name}
                    </Badge>
                  ))
                )}
                {lib.exports.length > 120 && (
                  <p className="text-[11px] text-muted-foreground">
                    + {lib.exports.length - 120} more…
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <ShieldCheck className="size-4 text-primary" />
                Parser detail
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-foreground">
              {lib.notes.length === 0 ? (
                <p className="flex gap-2">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  Container parsed cleanly — no anomalies reported.
                </p>
              ) : (
                lib.notes.map((n, i) => (
                  <p key={i} className="flex gap-2">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {n}
                  </p>
                ))
              )}

              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wider">first 256 bytes</p>
                  <pre className="terminal-scroll max-h-44 overflow-auto rounded-md border border-border/60 bg-background/60 p-2 font-mono text-[10px] leading-4">
                    {bytesToHexDumpPreview(lib.bytes, 256)}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-[11px] uppercase tracking-wider">last 128 bytes</p>
                  <pre className="terminal-scroll max-h-44 overflow-auto rounded-md border border-border/60 bg-background/60 p-2 font-mono text-[10px] leading-4">
                    {bytesToHexDumpTail(lib.bytes, 128)}
                  </pre>
                </div>
              </div>

              <div>
                <p className="mb-1 text-[11px] uppercase tracking-wider">
                  harvested strings (first 60 of{" "}
                  {forensics ? forensics.strings.length.toLocaleString() : "…"})
                </p>
                <div className="terminal-scroll max-h-52 overflow-auto rounded-md border border-border/60 bg-background/60 p-2">
                  {(forensics?.strings ?? []).slice(0, 60).map((s, i) => (
                    <div
                      key={`${s.offset}-${i}`}
                      className="flex gap-2 font-mono text-[10px] leading-4"
                    >
                      <span className="shrink-0 text-muted-foreground/70">{hex(s.offset)}</span>
                      <span className="min-w-0 truncate text-foreground/85">{s.value}</span>
                    </div>
                  ))}
                  {forensics && forensics.strings.length === 0 && (
                    <p className="text-[11px]">No printable strings of 4+ characters were found.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SECTIONS */}
        <TabsContent value="sections" className="flex flex-col gap-4">
          {lib.segments.length > 0 && (
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="font-display text-base">Segments / program headers</CardTitle>
              </CardHeader>
              <CardContent className="terminal-scroll max-h-72 overflow-auto">
                <table className="w-full font-mono text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">name</th>
                      <th className="px-2 py-1.5 text-left">vaddr</th>
                      <th className="px-2 py-1.5 text-left">fileoff</th>
                      <th className="px-2 py-1.5 text-left">filesize</th>
                      <th className="px-2 py-1.5 text-left">memsize</th>
                      <th className="px-2 py-1.5 text-left">prot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lib.segments.map((s) => (
                      <tr
                        key={s.index}
                        className="cursor-pointer border-b border-border/40 hover:bg-primary/5"
                        onClick={() => {
                          setFocusOffset(s.fileoff);
                          setTab("hex");
                        }}
                      >
                        <td className="px-2 py-1 text-muted-foreground">{s.index}</td>
                        <td className="px-2 py-1 text-foreground/90">{s.name}</td>
                        <td className="px-2 py-1 text-accent">{hex(s.vmaddr)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{hex(s.fileoff)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{hex(s.filesize)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{hex(s.vmsize)}</td>
                        <td className="px-2 py-1 text-primary">{s.flag}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-base">Sections</CardTitle>
            </CardHeader>
            <CardContent className="terminal-scroll max-h-[28rem] overflow-auto">
              {lib.sections.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  This container has no section table. Use the Hex tab to walk it manually.
                </p>
              ) : (
                <table className="w-full font-mono text-xs">
                  <thead className="sticky top-0 bg-card text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">name</th>
                      <th className="px-2 py-1.5 text-left">kind</th>
                      <th className="px-2 py-1.5 text-left">flags</th>
                      <th className="px-2 py-1.5 text-left">addr</th>
                      <th className="px-2 py-1.5 text-left">offset</th>
                      <th className="px-2 py-1.5 text-left">size</th>
                      <th className="px-2 py-1.5 text-left">segment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lib.sections.map((s) => (
                      <tr
                        key={s.index}
                        className="cursor-pointer border-b border-border/40 hover:bg-primary/5"
                        onClick={() => {
                          setFocusOffset(s.offset);
                          setTab("hex");
                        }}
                      >
                        <td className="px-2 py-1 text-muted-foreground">{s.index}</td>
                        <td className="px-2 py-1 text-foreground/90">{s.name}</td>
                        <td className="px-2 py-1 text-primary">{s.kind}</td>
                        <td className="px-2 py-1 text-muted-foreground">{s.flags}</td>
                        <td className="px-2 py-1 text-accent">{hex(s.addr)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{hex(s.offset)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{hex(s.size)}</td>
                        <td className="px-2 py-1 text-muted-foreground">{s.segment || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SYMBOLS */}
        <TabsContent value="symbols">
          <SymbolsPanel
            lib={lib}
            overrides={overrides}
            onRename={(original, next) =>
              setOverrides((prev) => {
                const copy = { ...prev };
                if (!next || next === original) delete copy[original];
                else copy[original] = next;
                return copy;
              })
            }
            onJump={(offset) => {
              setFocusOffset(offset);
              setTab("hex");
            }}
          />
        </TabsContent>

        {/* STRINGS */}
        <TabsContent value="strings">
          <StringsPanel
            lib={lib}
            onJump={(offset) => {
              setFocusOffset(offset);
              setTab("hex");
            }}
          />
        </TabsContent>

        {/* HEX + EDITOR */}
        <TabsContent value="hex" className="flex flex-col gap-4">
          <HexViewer
            key={focusOffset ?? "lib-start"}
            bytes={lib.bytes}
            patches={patches}
            sections={lib.sections}
            focusOffset={focusOffset}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Hammer className="size-4 text-primary" />
                  Byte editor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label className="font-mono text-[11px] text-muted-foreground">offset (hex)</Label>
                    <Input
                      value={patchOffset}
                      onChange={(e) => setPatchOffset(e.target.value)}
                      placeholder="1A2B3C"
                      className="mt-1 h-9 w-32 font-mono text-xs"
                    />
                  </div>
                  <div className="min-w-40 flex-1">
                    <Label className="font-mono text-[11px] text-muted-foreground">
                      replacement bytes
                    </Label>
                    <Input
                      value={patchHex}
                      onChange={(e) => setPatchHex(e.target.value)}
                      placeholder="C0 03 5F D6"
                      className="mt-1 h-9 font-mono text-xs"
                    />
                  </div>
                  <Button variant="outline" onClick={addPatch}>
                    Queue patch
                  </Button>
                </div>

                {patches.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Queued patches are applied when you download the patched lib. Nothing is written to
                    disk until you press the button.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {patches.map((p, i) => (
                      <div
                        key={`${p.offset}-${i}`}
                        className="flex items-center gap-2 rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5 font-mono text-xs"
                      >
                        <span className="text-accent">{hex(p.offset)}</span>
                        <span className="truncate text-foreground/90">{p.hex}</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="ml-auto"
                          onClick={() => setPatches((prev) => prev.filter((_, idx) => idx !== i))}
                          aria-label="Remove patch"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button onClick={downloadPatchedLib}>
                        <Save />
                        Download patched lib
                      </Button>
                      <Button variant="ghost" onClick={() => setPatches([])}>
                        Clear all
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-display text-base">
                  <Search className="size-4 text-primary" />
                  Byte pattern hunter
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-48 flex-1">
                    <Label className="font-mono text-[11px] text-muted-foreground">
                      pattern (?? = wildcard)
                    </Label>
                    <Input
                      value={patternInput}
                      onChange={(e) => setPatternInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") runSearch();
                      }}
                      placeholder="48 8B ?? E0"
                      className="mt-1 h-9 font-mono text-xs"
                    />
                  </div>
                  <Button variant="outline" onClick={runSearch}>
                    <Wand2 />
                    Scan
                  </Button>
                </div>
                {patternError && <p className="text-xs text-destructive">{patternError}</p>}
                {matches.length > 0 && (
                  <div className="terminal-scroll max-h-40 overflow-auto rounded-md border border-border/60">
                    <div className="flex flex-wrap gap-1 p-2">
                      {matches.map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setFocusOffset(m);
                            setTab("hex");
                          }}
                          className="rounded border border-border/60 px-1.5 py-0.5 font-mono text-[11px] text-accent hover:border-gold-soft hover:bg-primary/10"
                        >
                          {hex(m)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {matches.length === 0 && !patternError && (
                  <p className="text-xs text-muted-foreground">
                    Matches are reported as file offsets. {matches.length} result(s) so far.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* DISASM */}
        <TabsContent value="disasm">
          <DisasmPanel lib={lib} focusOffset={focusOffset} />
        </TabsContent>

        {/* SIGNATURE */}
        <TabsContent value="signature">
          <SignaturePanel lib={lib} focusOffset={focusOffset} />
        </TabsContent>

        {/* EXPORT */}
        <TabsContent value="export" className="flex flex-col gap-4">
          <Card className="border-border/70 shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-base">Export formats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {EXPORT_FORMATS.map((spec) => (
                  <button
                    key={spec.id}
                    onClick={() => setFormat(spec.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      format === spec.id
                        ? "border-gold-soft bg-primary/10"
                        : "border-border/70 bg-card/40 hover:border-gold-soft/60 hover:bg-primary/5",
                    )}
                  >
                    <p className="font-display text-sm tracking-wide">{spec.label}</p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{spec.hint}</p>
                    <p className="mt-1 font-mono text-[10px] text-accent">.{spec.ext}</p>
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-6 pt-1">
                <ToggleRow
                  label="Segments / program headers"
                  checked={includeSegments}
                  onChange={setIncludeSegments}
                />
                <ToggleRow label="Sections" checked={includeSections} onChange={setIncludeSections} />
                <ToggleRow label="Symbol table" checked={includeSymbols} onChange={setIncludeSymbols} />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => download(format)}>
                  <Download />
                  Download selected format
                </Button>
                <Button variant="secondary" onClick={() => void downloadEverything()} disabled={busy}>
                  {busy ? <Loader2 className="animate-spin" /> : <Download />}
                  Download every format
                </Button>
                {patches.length > 0 && (
                  <Button variant="outline" onClick={downloadPatchedLib}>
                    <Save />
                    Download patched lib
                  </Button>
                )}
              </div>

              <div className="rounded-lg border border-border/60 bg-background/50 p-3">
                <p className="font-mono text-[11px] leading-5 text-muted-foreground">
                  Every export opens with the LUCKY HUB drop-alert banner — lib name, arch, symbol
                  counts and{" "}
                  <span className="text-primary">{TOOL_NAME}</span> ·{" "}
                  <span className="text-gold">{OWNER_NAME}</span> · Telegram @LUCKY_HUB_DEV, plus the
                  exporting account ({userEmail || "guest"}), so your dumps always carry your credit.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}
