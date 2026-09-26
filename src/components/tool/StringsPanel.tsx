import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hex, hexPad, extractStrings, type LibString, type ParsedLib } from "@/lib/libreader";
import { Copy, Crosshair, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Empty } from "./SymbolsPanel";

interface StringsPanelProps {
  lib: ParsedLib;
  onJump: (offset: number) => void;
}

export function StringsPanel({ lib, onJump }: StringsPanelProps) {
  const [minLength, setMinLength] = useState(5);
  const [query, setQuery] = useState("");
  const [onlyPaths, setOnlyPaths] = useState(false);

  const strings = useMemo<LibString[]>(
    () => extractStrings(lib.bytes, { minLength, limit: 4000 }),
    [lib.bytes, minLength],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return strings.filter((s) => {
      if (onlyPaths) {
        const looksLikePath =
          /[/\\]/.test(s.value) || /\.(dylib|so|plist|png|json|dat|txt|xml|framework)\b/i.test(s.value);
        if (!looksLikePath) return false;
      }
      return q ? s.value.toLowerCase().includes(q) : true;
    });
  }, [strings, query, onlyPaths]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("String copied");
    } catch {
      toast.error("Clipboard blocked by the browser");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search strings…"
            className="h-9 w-full pl-8 font-mono text-xs sm:w-72"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">min length</span>
          <Input
            type="number"
            min={2}
            max={40}
            value={minLength}
            onChange={(e) => setMinLength(Math.max(2, Math.min(40, Number(e.target.value) || 2)))}
            className="h-9 w-16 font-mono text-xs"
          />
        </div>
        <Button
          variant={onlyPaths ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyPaths((v) => !v)}
        >
          Paths / files only
        </Button>
        <Badge variant="secondary" className="font-mono">
          {filtered.length.toLocaleString()} shown
        </Badge>
      </div>

      {filtered.length === 0 ? (
        <Empty
          title="No strings matched"
          body="Lower the minimum length or clear the search. Strings are harvested from raw bytes, so they work on stripped libs too."
        />
      ) : (
        <div className="terminal-scroll max-h-[30rem] overflow-auto rounded-lg border border-border/70">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              {filtered.slice(0, 800).map((s, i) => (
                <tr key={`${s.offset}-${i}`} className="border-b border-border/40 hover:bg-primary/5">
                  <td className="whitespace-nowrap px-2 py-1 text-muted-foreground/80">
                    {hexPad(s.offset, 8)}
                  </td>
                  <td className="max-w-0 px-2 py-1">
                    <span className="block truncate text-foreground/90">{s.value}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Jump to offset"
                      onClick={() => onJump(s.offset)}
                    >
                      <Crosshair />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={`Copy (${hex(s.offset)})`}
                      onClick={() => copy(s.value)}
                    >
                      <Copy />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
