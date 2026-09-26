import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { disassemble, hex, hexPad, vaddrToOffset, type ParsedLib } from "@/lib/libreader";
import { CornerDownLeft, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Empty } from "./SymbolsPanel";

const COUNTS = [128, 512, 1024, 4096];

interface DisasmPanelProps {
  lib: ParsedLib;
  focusOffset?: number | null;
}

export function DisasmPanel({ lib, focusOffset }: DisasmPanelProps) {
  const defaultStart = useMemo(() => {
    if (typeof focusOffset === "number" && focusOffset > 0) return focusOffset;
    const entryOffset = lib.entry > 0 ? vaddrToOffset(lib, lib.entry) : null;
    if (entryOffset !== null && entryOffset > 0) return entryOffset;
    const text = lib.sections.find((s) => s.kind === "TEXT" || s.name.includes("text"));
    return text?.offset ?? 0;
  }, [lib, focusOffset]);

  const [startInput, setStartInput] = useState(hexPad(defaultStart, 8));
  const [appliedStart, setAppliedStart] = useState(defaultStart);
  const [count, setCount] = useState(512);

  const lines = useMemo(
    () => disassemble(lib, appliedStart, count),
    [lib, appliedStart, count],
  );

  const apply = () => {
    const value = Number.parseInt(startInput.trim().replace(/^0x/i, ""), 16);
    if (Number.isNaN(value)) {
      toast.error("Enter a hex file offset");
      return;
    }
    setAppliedStart(Math.max(0, Math.min(lib.bytes.length - 4, value)));
  };

  if (lib.bytes.length < 4) {
    return <Empty title="Nothing to disassemble" body="The lib is smaller than one instruction." />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-muted-foreground">start</span>
          <Input
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") apply();
            }}
            className="h-9 w-32 font-mono text-xs"
          />
          <Button variant="outline" size="icon-sm" onClick={apply} aria-label="Disassemble from offset">
            <Play />
          </Button>
        </div>

        <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTS.map((c) => (
              <SelectItem key={c} value={String(c)}>
                {c} instructions
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {lib.symbols.length > 0 && (
          <Select
            value=""
            onValueChange={(value) => {
              const sym = lib.symbols[Number(value)];
              if (!sym || sym.offset <= 0) return;
              setAppliedStart(sym.offset);
              setStartInput(hexPad(sym.offset, 8));
            }}
          >
            <SelectTrigger className="h-9 w-56 text-xs">
              <SelectValue placeholder="Jump to a function…" />
            </SelectTrigger>
            <SelectContent>
              {lib.symbols
                .filter((s) => s.kind === "FUNC" && s.offset > 0)
                .slice(0, 400)
                .map((s) => (
                  <SelectItem key={s.index} value={String(s.index)} className="font-mono text-xs">
                    {s.name.slice(0, 40)} @ {hexPad(s.offset, 6)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

        <Badge variant="secondary" className="ml-auto font-mono">
          {lib.arch} · {lib.bits}-bit · lite decoder
        </Badge>
      </div>

      <div className="terminal-scroll max-h-[32rem] overflow-auto rounded-lg border border-border/70 bg-background/70">
        <table className="w-full border-collapse font-mono text-xs">
          <tbody>
            {lines.map((line) => (
              <tr key={line.offset} className="hover:bg-primary/5">
                <td className="whitespace-nowrap px-2 py-0.5 text-muted-foreground/70">
                  {hexPad(line.offset, 8)}
                </td>
                <td className="whitespace-nowrap px-2 py-0.5 text-accent/70">
                  {line.vaddr !== null ? hex(line.vaddr) : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-0.5 text-muted-foreground/60">
                  {line.raw}
                </td>
                <td className="whitespace-nowrap px-2 py-0.5 text-foreground/95">{line.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <CornerDownLeft className="size-3" />
        arm64 control flow, movz/movk, add/sub, adrp and load/store decode natively. Anything exotic is
        shown as a raw <span className="font-mono">.word</span> — the bytes are always exact.
      </p>
    </div>
  );
}
