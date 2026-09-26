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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { hex, hexPad, type LibSymbol, type ParsedLib } from "@/lib/libreader";
import { Check, Copy, Crosshair, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface SymbolsPanelProps {
  lib: ParsedLib;
  overrides: Record<string, string>;
  onRename: (original: string, next: string) => void;
  onJump: (offset: number) => void;
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Clipboard blocked by the browser");
  }
}

export function SymbolsPanel({ lib, overrides, onRename, onJump }: SymbolsPanelProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [limit, setLimit] = useState(250);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const kinds = useMemo(() => {
    const set = new Set<string>();
    for (const s of lib.symbols) set.add(s.kind);
    return [...set].sort();
  }, [lib.symbols]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lib.symbols.filter((s) => {
      if (kind !== "all" && s.kind !== kind) return false;
      if (!q) return true;
      const label = overrides[s.name] ?? s.name;
      return (
        label.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        hexPad(s.value, 1).includes(q) ||
        hexPad(s.offset, 1).includes(q)
      );
    });
  }, [lib.symbols, query, kind, overrides]);

  if (lib.symbols.length === 0) {
    return (
      <Empty
        title="No symbol table in this lib"
        body="The binary looks stripped. Use the Hex, Strings and Signatures tabs — they work on raw bytes and do not need symbols."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, address or offset…"
          className="h-9 w-full font-mono text-xs sm:w-72"
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="font-mono">
          {filtered.length.toLocaleString()} / {lib.symbols.length.toLocaleString()}
        </Badge>
        {lib.imports.length > 0 && (
          <Badge variant="outline" className="font-mono">
            imports {lib.imports.length}
          </Badge>
        )}
        {lib.exports.length > 0 && (
          <Badge variant="outline" className="font-mono">
            exports {lib.exports.length}
          </Badge>
        )}
      </div>

      <div className="terminal-scroll max-h-[30rem] overflow-auto rounded-lg border border-border/70">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            <TableRow>
              <TableHead className="w-14 font-mono text-xs">#</TableHead>
              <TableHead className="font-mono text-xs">Name</TableHead>
              <TableHead className="font-mono text-xs">Address</TableHead>
              <TableHead className="font-mono text-xs">File offset</TableHead>
              <TableHead className="font-mono text-xs">Size</TableHead>
              <TableHead className="font-mono text-xs">Bind</TableHead>
              <TableHead className="font-mono text-xs">Type</TableHead>
              <TableHead className="font-mono text-xs">Section</TableHead>
              <TableHead className="w-24 text-right font-mono text-xs">Tools</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, limit).map((sym: LibSymbol) => {
              const label = overrides[sym.name] ?? sym.name;
              const isEditing = editing === sym.name;
              return (
                <TableRow key={`${sym.index}-${sym.name}`}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {sym.index}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <Input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          className="h-7 w-52 font-mono text-xs"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onRename(sym.name, draft.trim());
                              setEditing(null);
                            }
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => {
                            onRename(sym.name, draft.trim());
                            setEditing(null);
                          }}
                          aria-label="Save label"
                        >
                          <Check />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => setEditing(null)}
                          aria-label="Cancel"
                        >
                          <X />
                        </Button>
                      </div>
                    ) : (
                      <span className={overrides[sym.name] ? "text-primary" : undefined}>
                        {label}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-accent">{hex(sym.value)}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {hex(sym.offset)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {sym.size > 0 ? hex(sym.size) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    <Badge variant={sym.external ? "default" : "secondary"} className="text-[10px]">
                      {sym.bind}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{sym.kind}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {sym.section}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Rename / add label"
                        onClick={() => {
                          setEditing(sym.name);
                          setDraft(label);
                        }}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Jump to file offset"
                        disabled={sym.offset <= 0}
                        onClick={() => onJump(sym.offset)}
                      >
                        <Crosshair />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Copy address"
                        onClick={() => copy(hex(sym.value), sym.name)}
                      >
                        <Copy />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {filtered.length > limit && (
        <Button variant="outline" onClick={() => setLimit((l) => l + 500)}>
          Show 500 more ({filtered.length - limit} remaining)
        </Button>
      )}
    </div>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/80 bg-card/40 p-8 text-center">
      <p className="font-display text-sm tracking-wide text-primary">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}
