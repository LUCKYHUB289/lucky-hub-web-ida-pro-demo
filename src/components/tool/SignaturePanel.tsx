import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildSignature,
  hexPad,
  type ParsedLib,
} from "@/lib/libreader";
import { Copy, Fingerprint, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface SignaturePanelProps {
  lib: ParsedLib;
  focusOffset?: number | null;
}

export function SignaturePanel({ lib, focusOffset }: SignaturePanelProps) {
  const [offsetInput, setOffsetInput] = useState(hexPad(focusOffset && focusOffset > 0 ? focusOffset : 0, 8));
  const [length, setLength] = useState(32);
  const [bulk, setBulk] = useState<string | null>(null);
  const [bulkCount, setBulkCount] = useState(0);

  const offset = useMemo(() => {
    const v = Number.parseInt(offsetInput.trim().replace(/^0x/i, ""), 16);
    return Number.isNaN(v) ? 0 : Math.max(0, Math.min(lib.bytes.length - 4, v));
  }, [offsetInput, lib.bytes.length]);

  const signature = useMemo(
    () => buildSignature(lib, offset, Math.max(4, Math.min(256, length))),
    [lib, offset, length],
  );

  const bytesAt = useMemo(
    () => Array.from(lib.bytes.subarray(offset, offset + Math.max(4, Math.min(256, length)))),
    [lib, offset, length],
  );

  const generated = useMemo(() => {
    const funcs = lib.symbols.filter((s) => s.kind === "FUNC" && s.offset > 0);
    const source = funcs.length > 0 ? funcs : lib.symbols.filter((s) => s.offset > 0);
    return source.slice(0, 1500).map((s) => ({
      name: s.name,
      vaddr: s.value,
      offset: s.offset,
      sig: buildSignature(lib, s.offset, 32),
    }));
  }, [lib]);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard blocked by the browser");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border/70 bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <Fingerprint className="size-4 text-primary" />
          <p className="font-display text-sm tracking-wide">Signature forge</p>
          <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
            branch immediates auto-wildcarded
          </Badge>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block font-mono text-[11px] text-muted-foreground">
              file offset (hex)
            </label>
            <Input
              value={offsetInput}
              onChange={(e) => setOffsetInput(e.target.value)}
              className="h-9 w-32 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] text-muted-foreground">
              length (bytes)
            </label>
            <Input
              type="number"
              min={4}
              max={256}
              step={4}
              value={length}
              onChange={(e) => setLength(Number(e.target.value) || 4)}
              className="h-9 w-24 font-mono text-xs"
            />
          </div>
          <Button variant="outline" onClick={() => copy(signature, "Signature")}>
            <Copy />
            Copy signature
          </Button>
        </div>

        <Textarea
          readOnly
          value={signature}
          className="mt-3 min-h-24 font-mono text-xs leading-6"
          spellCheck={false}
        />

        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          raw bytes: {bytesAt.map((b) => hexPad(b, 2)).join(" ")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            const lines: string[] = [
              `// LUCKY HUB WEB IDA PRO — auto signatures (${lib.arch} ${lib.bits}-bit)`,
              `// Owner: LUCKY HATHUNGO WALA · @LUCKY_HUB_DEV`,
              "",
            ];
            for (const g of generated) {
              if (!g.sig) continue;
              lines.push(`${g.sig}  // ${g.name} | vaddr 0x${g.vaddr.toString(16)} | file 0x${g.offset.toString(16)}`);
            }
            setBulk(lines.join("\n"));
            setBulkCount(generated.filter((g) => g.sig).length);
            toast.success(`Generated ${generated.filter((g) => g.sig).length} signatures`);
          }}
          disabled={generated.length === 0}
        >
          <Wand2 />
          Auto-generate for every symbol ({generated.length})
        </Button>
        {bulk && (
          <Button variant="outline" onClick={() => copy(bulk, "All signatures")}>
            <Copy />
            Copy all
          </Button>
        )}
        {bulk && (
          <Badge variant="secondary" className="font-mono">
            {bulkCount} signatures ready
          </Badge>
        )}
      </div>

      {bulk ? (
        <Textarea
          readOnly
          value={bulk}
          className="terminal-scroll max-h-96 min-h-64 overflow-auto font-mono text-[11px] leading-5"
          spellCheck={false}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          Signatures are built from the symbol table when one exists, otherwise from the entry point.
          Every branch target is wildcarded so the pattern survives across app updates.
        </p>
      )}
    </div>
  );
}
