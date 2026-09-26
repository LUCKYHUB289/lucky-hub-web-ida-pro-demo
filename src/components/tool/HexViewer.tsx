import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { hexPad, type BytePatch, type LibSection } from "@/lib/libreader";
import { ChevronLeft, ChevronRight, CornerDownLeft } from "lucide-react";
import { useMemo, useState } from "react";

const ROWS_PER_PAGE = 256;
const BYTES_PER_ROW = 16;

interface HexViewerProps {
  bytes: Uint8Array;
  patches: BytePatch[];
  sections: LibSection[];
  /** Scroll straight to this file offset (e.g. after jumping from a symbol). */
  focusOffset?: number | null;
  onPickOffset?: (offset: number) => void;
}

function isPatchStart(patches: BytePatch[], offset: number): BytePatch | undefined {
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    const len = p.hex.replace(/[^0-9a-f?]/gi, "").length / 2;
    if (offset >= p.offset && offset < p.offset + Math.max(1, Math.ceil(len))) return p;
  }
  return undefined;
}

export function HexViewer({
  bytes,
  patches,
  sections,
  focusOffset,
  onPickOffset,
}: HexViewerProps) {
  const totalPages = Math.max(1, Math.ceil(bytes.length / (ROWS_PER_PAGE * BYTES_PER_ROW)));

  const initialPage = (focus: number | null | undefined) => {
    if (typeof focus !== "number" || focus < 0) return 0;
    return Math.min(totalPages - 1, Math.floor(Math.floor(focus / BYTES_PER_ROW) / ROWS_PER_PAGE));
  };

  // `focusOffset` is applied at mount; the parent remounts this viewer (via key)
  // whenever a new offset is requested, so no effect-driven state sync is needed.
  const [page, setPage] = useState(() => initialPage(focusOffset));
  const [jump, setJump] = useState(() =>
    typeof focusOffset === "number" ? hexPad(focusOffset, 8) : "",
  );

  const start = page * ROWS_PER_PAGE * BYTES_PER_ROW;

  const rows = useMemo(() => {
    const out: { offset: number; bytes: number[]; ascii: string }[] = [];
    const limit = Math.min(bytes.length, start + ROWS_PER_PAGE * BYTES_PER_ROW);
    for (let offset = start; offset < limit; offset += BYTES_PER_ROW) {
      const slice = Array.from(bytes.subarray(offset, offset + BYTES_PER_ROW));
      out.push({
        offset,
        bytes: slice,
        ascii: slice.map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join(""),
      });
    }
    return out;
  }, [bytes, start]);

  const goToJump = () => {
    const raw = jump.trim().replace(/^0x/i, "");
    const value = Number.parseInt(raw, 16);
    if (Number.isNaN(value)) return;
    const capped = Math.max(0, Math.min(bytes.length - 1, value));
    const row = Math.floor(capped / BYTES_PER_ROW);
    setPage(Math.min(totalPages - 1, Math.floor(row / ROWS_PER_PAGE)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <Badge variant="secondary" className="font-mono">
            page {page + 1} / {totalPages}
          </Badge>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Input
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") goToJump();
            }}
            placeholder="0x1A2B3C"
            className="h-8 w-32 font-mono text-xs"
          />
          <Button variant="outline" size="icon-sm" onClick={goToJump} aria-label="Jump to offset">
            <CornerDownLeft />
          </Button>
        </div>

        {sections.length > 0 && (
          <Select
            value=""
            onValueChange={(value) => {
              const sec = sections[Number(value)];
              if (!sec) return;
              const row = Math.floor(sec.offset / BYTES_PER_ROW);
              setPage(Math.min(totalPages - 1, Math.floor(row / ROWS_PER_PAGE)));
              setJump(hexPad(sec.offset, 8));
            }}
          >
            <SelectTrigger className="h-8 w-52 text-xs">
              <SelectValue placeholder="Jump to section…" />
            </SelectTrigger>
            <SelectContent>
              {sections.slice(0, 200).map((s) => (
                <SelectItem key={s.index} value={String(s.index)} className="font-mono text-xs">
                  {s.name} @ {hexPad(s.offset, 6)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-primary" /> patched
          </span>
          <span className="font-mono">
            {hexPad(start, 8)} – {hexPad(Math.min(bytes.length, start + ROWS_PER_PAGE * BYTES_PER_ROW), 8)}
          </span>
        </div>
      </div>

      <div className="terminal-scroll max-h-[26rem] overflow-auto rounded-lg border border-border/70 bg-background/70">
        <table className="w-full border-collapse font-mono text-[11px] leading-5 sm:text-xs">
          <tbody>
            {rows.map((row) => (
              <tr key={row.offset} className="hover:bg-primary/5">
                <td
                  className="cursor-pointer select-none whitespace-nowrap px-2 text-muted-foreground/80"
                  onClick={() => onPickOffset?.(row.offset)}
                  title="Use this offset"
                >
                  {hexPad(row.offset, 8)}
                </td>
                <td className="whitespace-nowrap px-2">
                  {row.bytes.map((b, i) => {
                    const patch = isPatchStart(patches, row.offset + i);
                    return (
                      <span
                        key={i}
                        className={cn(
                          "inline-block w-[1.45em] text-center",
                          patch ? "rounded-sm bg-primary/25 text-primary" : "text-foreground/90",
                        )}
                      >
                        {hexPad(b, 2)}
                      </span>
                    );
                  })}
                </td>
                <td className="whitespace-pre px-2 text-accent/80">{row.ascii}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
