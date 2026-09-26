import logo from "@/assets/logo.svg";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { EXPORT_FORMATS, OWNER_NAME, TELEGRAM_CHANNEL, TOOL_NAME } from "@/lib/libreader";
import { motion } from "framer-motion";
import {
  Binary,
  Crown,
  Cpu,
  Download,
  FileCode2,
  Fingerprint,
  Layers,
  Menu,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Wand2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

const HEX_PREVIEW = [
  { addr: "0001A2B0", bytes: "FD 7B BF A9  FD 03 00 91  F3 03 00 AA  F5 03 01 AA" },
  { addr: "0001A2C0", bytes: "F4 03 02 AA  20 00 80 52  E0 03 3F D6  1F 20 03 D5" },
  { addr: "0001A2D0", bytes: "F4 03 02 AA  ?? ?? ?? ??  E0 03 3F D6  1F 20 03 D5" },
  { addr: "0001A2E0", bytes: "08 00 40 F9  09 00 40 F9  1F 01 09 EB  E0 07 00 54" },
  { addr: "0001A2F0", bytes: "\u2014 \u2014 \u2014 \u2014  ?? ?? ?? ??  C0 03 5F D6  FD 7B C1 A8" },
];

const SYMBOLS = [
  { name: "_ZN7LuckyHub12dumpOffsetsEv", addr: "0x0001A2B0", kind: "FUNC" },
  { name: "_ZN7LuckyHub10signatureEPh", addr: "0x0001A3F4", kind: "FUNC" },
  { name: "kLuckyHubEncryptionKey", addr: "0x0004C120", kind: "OBJECT" },
  { name: "_ZN7LuckyHub14patchInternalEv", addr: "0x0001A8C0", kind: "FUNC" },
];

const FEATURES = [
  {
    icon: Binary,
    title: "Reads every lib container",
    body: "ELF 32/64 (LE + BE), Mach-O thin and universal, raw .so/.dylib/.a and PE. Header tables, segments and sections laid out exactly like a disassembler.",
  },
  {
    icon: Layers,
    title: "Dumps all offsets at once",
    body: "Full symbol table with addresses and file offsets, imports, exports, section ranges and a virtual ↔ file offset mapper you can click through.",
  },
  {
    icon: TerminalSquare,
    title: "Hex reader + byte editor",
    body: "Paged hex walker, wildcard pattern hunter and a patch queue that writes a modified binary back out when you are done.",
  },
  {
    icon: Fingerprint,
    title: "Signature forge",
    body: "Generate AOB signatures per function with branch targets auto-wildcarded so your patterns survive the next app update.",
  },
  {
    icon: Download,
    title: "One-click dump everything",
    body: "IDA listing, JSON, C/C++ header, .idc script, AOB pack and CSV offset table — all exported in one press, stamped with your details.",
  },
  {
    icon: Cpu,
    title: "Lite disassembler inside",
    body: "arm64 control flow, movz/movk, adrp, add/sub and load/store decode natively, with addresses and raw bytes beside every line.",
  },
];

const STEPS = [
  { n: "01", t: "Drop the lib", d: "Drag a dylib, so, a or any raw blob into the workbench." },
  { n: "02", t: "Read the map", d: "Sections, symbols and strings resolve instantly, offline." },
  { n: "03", t: "Edit if you need", d: "Queue byte patches and export the patched binary." },
  { n: "04", t: "Dump everything", d: "One press writes every format to your machine." },
];

function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>
      {children}
    </section>
  );
}

export default function Landing() {
  const { isAuthenticated, hasBackend } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  /** Signed in → workspace. Backend available → sign-in. Otherwise → public tool. */
  const enter = () => {
    if (isAuthenticated) return navigate("/dashboard");
    if (hasBackend) return navigate("/auth?returnTo=/dashboard");
    return navigate("/tool");
  };
  const ctaLabel = isAuthenticated ? "Dashboard" : "Open the workbench";

  const links = [
    { href: "#features", label: "Features" },
    { href: "#toolkit", label: "Toolkit" },
    { href: "#flow", label: "How it works" },
    { href: "#owner", label: "Owner" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* NAVBAR */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur">
        <Section className="flex items-center gap-3 py-3">
          <button onClick={() => navigate("/")} className="flex items-center gap-3">
            <img src={logo} alt="LUCKY HUB" width={38} height={38} className="rounded-lg" />
            <span className="text-left">
              <span className="block font-display text-sm leading-tight tracking-wide text-gold sm:text-base">
                LUCKY HUB
              </span>
              <span className="block font-mono text-[10px] leading-tight text-muted-foreground">
                WEB IDA PRO
              </span>
            </span>
          </button>

          <nav className="ml-6 hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <a href="https://t.me/LUCKY_HUB_DEV" target="_blank" rel="noopener noreferrer">
                <Send />
                {TELEGRAM_CHANNEL}
              </a>
            </Button>
            <Button size="sm" onClick={enter}>
              {ctaLabel}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </Section>

        {menuOpen && (
          <Section className="flex flex-col gap-1 pb-3 lg:hidden">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-primary/5 hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <a
              href="https://t.me/LUCKY_HUB_DEV"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-3 py-2 text-sm text-primary"
            >
              Telegram {TELEGRAM_CHANNEL}
            </a>
          </Section>
        )}
      </header>

      {/* HERO */}
      <div className="relative overflow-hidden border-b border-border/50 bg-grid">
        <div className="pointer-events-none absolute inset-0 bg-radial-gold" />
        <Section className="relative grid gap-10 py-14 lg:grid-cols-2 lg:items-center lg:py-20">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="outline" className="border-gold-soft font-mono text-[11px]">
              <Crown className="size-3 text-primary" />
              {OWNER_NAME} · {TELEGRAM_CHANNEL}
            </Badge>

            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
              Dump every offset
              <span className="mt-2 block text-gold">inside any lib.</span>
            </h1>

            <p className="mt-5 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {TOOL_NAME} is the browser workbench that reads, edits and exports everything a lib
              contains — sections, symbols, addresses, signatures and raw bytes. Drop a file, press one
              button, walk away with the whole dump.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={enter} className="gold-glow">
                <TerminalSquare />
                {ctaLabel}
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/tool")}>
                <Sparkles />
                Try it — no account
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
              {["100% offline parsing", "No upload, no queue", "Auto feedback to the owner"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-primary" />
                  {t}
                </span>
              ))}
            </div>
          </motion.div>

          {/* terminal mock */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="rounded-xl border border-gold-soft bg-card/80 p-3 backdrop-blur"
          >
            <div className="flex items-center gap-2 border-b border-border/50 pb-2">
              <span className="size-2.5 rounded-full bg-destructive/70" />
              <span className="size-2.5 rounded-full bg-primary/70" />
              <span className="size-2.5 rounded-full bg-accent/70" />
              <span className="ml-2 truncate font-mono text-[10px] text-muted-foreground">
                luckyhub://lib/LuckyHub.dylib
              </span>
              <Badge variant="secondary" className="ml-auto font-mono text-[10px]">
                arm64
              </Badge>
            </div>

            <div className="terminal-scroll mt-3 overflow-x-auto">
              <table className="w-full font-mono text-[11px]">
                <tbody>
                  {HEX_PREVIEW.map((row) => (
                    <tr key={row.addr}>
                      <td className="whitespace-nowrap pr-3 text-muted-foreground/70">{row.addr}</td>
                      <td className="whitespace-nowrap text-foreground/90">{row.bytes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3">
              {SYMBOLS.map((s) => (
                <div key={s.name} className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="text-accent">{s.addr}</span>
                  <span className="truncate text-foreground/85">{s.name}</span>
                  <Badge variant="outline" className="ml-auto text-[9px]">
                    {s.kind}
                  </Badge>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-lg border border-gold-soft bg-primary/10 px-3 py-2">
              <Download className="size-4 shrink-0 text-primary" />
              <span className="truncate text-xs">
                Full dump exported · 6 formats · owner notified
              </span>
            </div>
          </motion.div>
        </Section>
      </div>

      {/* STATS */}
      <Section className="grid grid-cols-2 gap-4 py-10 sm:grid-cols-4">
        {[
          { k: "Containers", v: "ELF · Mach-O · PE" },
          { k: "Export formats", v: "6 in one click" },
          { k: "Disassembler", v: "arm64 lite" },
          { k: "Parsing", v: "On-device" },
        ].map((s) => (
          <div key={s.k} className="rounded-lg border border-border/70 bg-card/40 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{s.k}</p>
            <p className="mt-1 font-display text-sm text-gold sm:text-base">{s.v}</p>
          </div>
        ))}
      </Section>

      {/* FEATURES */}
      <Section id="features" className="py-12">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
            what it does
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            A full reverse-engineering bench, <span className="text-gold">in a browser tab</span>
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            No installs, no licence servers, no waiting. Everything below runs the moment the file lands.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="group rounded-xl border border-border/70 bg-card/40 p-5 transition-colors hover:border-gold-soft hover:bg-primary/5"
            >
              <div className="flex size-10 items-center justify-center rounded-lg border border-gold-soft bg-primary/10">
                <f.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 font-display text-base tracking-wide">{f.title}</h3>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* TOOLKIT / EXPORTS */}
      <Section id="toolkit" className="py-12">
        <div className="rounded-2xl border border-gold-soft bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-9">
          <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
                the export bench
              </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight">
              Everything in the lib,{" "}
              <span className="text-gold">one click to download</span>
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Press the button and every format is written to your machine in sequence — each file
              stamped with the tool name, the owner and your account details so your dumps are always
              traceable.
            </p>
            <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              Works with no install and no account — drop the build on any website and it runs.
            </p>
              <Button size="lg" className="mt-6" onClick={() => navigate("/tool")}>
                <Download />
                Open the workbench
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {EXPORT_FORMATS.map((f) => (
                <div
                  key={f.id}
                  className="rounded-lg border border-border/60 bg-background/50 p-3"
                >
                  <p className="flex items-center gap-2 font-mono text-[11px] text-accent">
                    <FileCode2 className="size-3.5" />
                    .{f.ext}
                  </p>
                  <p className="mt-1 font-display text-sm tracking-wide">{f.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* FLOW */}
      <Section id="flow" className="py-12">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">the flow</p>
        <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Four moves from file to <span className="text-gold">finished dump</span>
        </h2>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="rounded-xl border border-border/70 bg-card/40 p-5"
            >
              <span className="font-display text-2xl text-gold/70">{s.n}</span>
              <h3 className="mt-3 font-display text-base tracking-wide">{s.t}</h3>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{s.d}</p>
            </motion.div>
          ))}
        </div>
      </Section>

      {/* OWNER */}
      <Section id="owner" className="py-12">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-2xl border border-border/70 bg-card/40 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full border border-gold-soft bg-primary/10">
                <Crown className="size-5 text-primary" />
              </div>
              <div>
                <p className="font-display text-lg tracking-wide text-gold">{OWNER_NAME}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  Owner · {TELEGRAM_CHANNEL}
                </p>
              </div>
            </div>

            <h2 className="mt-6 font-display text-2xl font-bold tracking-tight">
              Built-in auto feedback to the owner
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Every time someone analyses a lib, downloads a dump, patches a binary or forges a
              signature, the tool quietly reports it back to the owner's Telegram bot — who used it,
              which lib, which format, when. Users can also send a message and a rating straight from
              the dashboard.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild>
                <a href="https://t.me/LUCKY_HUB_DEV" target="_blank" rel="noopener noreferrer">
                  <Send />
                  Join {TELEGRAM_CHANNEL}
                </a>
              </Button>
              <Button variant="outline" onClick={enter}>
                <Wand2 />
                Try the tool
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
            <div className="flex items-center gap-2 border-b border-border/50 pb-2">
              <Send className="size-3.5 text-primary" />
              <span className="font-mono text-[10px] text-muted-foreground">
                telegram · bot delivery
              </span>
            </div>
            <div className="mt-3 space-y-3 font-mono text-[11px] leading-5">
              <div>
                <p className="text-muted-foreground/70">LUCKY HUB WEB IDA PRO</p>
                <p className="text-primary">⬇️ One-click dump downloaded</p>
              </div>
              <div className="space-y-1 rounded-lg border border-border/50 bg-card/50 p-3">
                <p>👤 User: lucky_operator</p>
                <p>📦 Lib: LuckyHub.dylib</p>
                <p>⚙️ Arch: arm64 (64-bit)</p>
                <p>🔖 Symbols: 18,204</p>
                <p>📁 Export: ALL FORMATS</p>
                <p className="text-accent">🕒 delivered</p>
              </div>
              <div>
                <p className="text-primary">💬 Feedback from a user</p>
                <p className="text-foreground/85">⭐ 5/5 · “Cleanest offset dump I've used.”</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* FINAL CTA */}
      <Section className="py-14">
        <div className="relative overflow-hidden rounded-2xl border border-gold-soft bg-grid p-8 text-center sm:p-12">
          <div className="pointer-events-none absolute inset-0 bg-radial-gold" />
          <div className="relative">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Your next lib is <span className="text-gold">ten seconds</span> from fully mapped
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
              Sign in with just an email, drop the file, and take the whole offset dump with you.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={enter} className="gold-glow">
                <TerminalSquare />
                {ctaLabel}
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="https://t.me/LUCKY_HUB_DEV" target="_blank" rel="noopener noreferrer">
                  <Send />
                  {TELEGRAM_CHANNEL}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* FOOTER */}
      <footer className="border-t border-border/50 py-8">
        <Section className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3">
            <img src={logo} alt="LUCKY HUB" width={32} height={32} className="rounded-lg" />
            <span className="font-display text-sm tracking-wide text-gold">{TOOL_NAME}</span>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            Owner {OWNER_NAME} · Telegram {TELEGRAM_CHANNEL}
          </p>
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground/80">
            <Search className="size-3" />
            Built for reading your own binaries. Respect the terms and laws that apply to you.
          </p>
        </Section>
      </footer>
    </div>
  );
}
