/**
 * LUCKY HUB WEB IDA PRO — in-browser lib engine.
 *
 * Parses ELF (32/64, LE/BE), Mach-O (32/64 + universal/fat) and PE binaries
 * straight from an ArrayBuffer and exposes the things a reverse engineer wants:
 * segments, sections, symbols, imports/exports, file-offset <-> virtual-address
 * mapping, string harvesting, byte-pattern search, a lite arm64 disassembler,
 * AOB signature generation and multi-format offset exporters.
 *
 * Everything runs client-side: no file ever leaves the browser.
 */

export const TOOL_NAME = "LUCKY HUB WEB IDA PRO";
export const OWNER_NAME = "LUCKY HATHUNGO WALA";
export const TELEGRAM_CHANNEL = "@LUCKY_HUB_DEV";

export type LibFormat = "ELF" | "Mach-O" | "Mach-O Fat" | "PE" | "Unknown";

export interface LibField {
  key: string;
  value: string;
}

export interface LibSegment {
  index: number;
  name: string;
  vmaddr: number;
  vmsize: number;
  fileoff: number;
  filesize: number;
  initprot: number;
  maxprot: number;
  flag: string;
}

export interface LibSection {
  index: number;
  name: string;
  kind: string;
  flags: string;
  addr: number;
  offset: number;
  size: number;
  entsize: number;
  align: number;
  segment: string;
}

export interface LibSymbol {
  index: number;
  name: string;
  value: number;
  size: number;
  bind: string;
  kind: string;
  section: string;
  external: boolean;
  offset: number;
}

export interface LibString {
  offset: number;
  value: string;
}

export interface ParsedLib {
  format: LibFormat;
  arch: string;
  bits: 32 | 64;
  endian: "little" | "big";
  entry: number;
  imageBase: number;
  bytes: Uint8Array;
  fields: LibField[];
  segments: LibSegment[];
  sections: LibSection[];
  symbols: LibSymbol[];
  imports: string[];
  exports: string[];
  notes: string[];
}

/* ------------------------------------------------------------------ *
 * Low level helpers
 * ------------------------------------------------------------------ */

const textDecoder = new TextDecoder("utf-8", { fatal: false });

export function readCString(bytes: Uint8Array, offset: number, max = 8192): string {
  if (!Number.isFinite(offset) || offset < 0 || offset >= bytes.length) return "";
  let end = offset;
  const limit = Math.min(bytes.length, offset + max);
  while (end < limit && bytes[end] !== 0) end++;
  return textDecoder.decode(bytes.subarray(offset, end));
}

export function hex(value: number, width = 0): string {
  if (!Number.isFinite(value)) return "0x0";
  const v = value < 0 ? value >>> 0 : value;
  const s = v.toString(16);
  return `0x${width > 0 ? s.padStart(width, "0") : s}`;
}

export function hexPad(value: number, width: number): string {
  const v = value < 0 ? value >>> 0 : value;
  return v.toString(16).padStart(width, "0");
}

/* ------------------------------------------------------------------ *
 * Info-tab forensics: checksums, entropy + tail preview
 * ------------------------------------------------------------------ */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** Standard zlib/PNG CRC-32, handy for identifying firmware images. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** FNV-1a 32-bit hash — cheap fingerprint used by many loaders. */
export function fnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Shannon entropy in bits/byte (0 = uniform, 8 = fully random / packed). */
export function entropyOf(bytes: Uint8Array): number {
  if (bytes.length === 0) return 0;
  const counts = new Uint32Array(256);
  for (let i = 0; i < bytes.length; i++) counts[bytes[i]]++;
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (counts[i] === 0) continue;
    const p = counts[i] / bytes.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Hex walker for the last `max` bytes of a file. */
export function bytesToHexDumpTail(bytes: Uint8Array, max = 128): string {
  const start = Math.max(0, bytes.length - max);
  const aligned = start - (start % 16);
  const out: string[] = [];
  for (let i = aligned; i < bytes.length; i += 16) {
    const chunk = Array.from(bytes.subarray(i, Math.min(i + 16, bytes.length)));
    out.push(`${hexPad(i, 8)}  ${chunk.map((b) => hexPad(b, 2)).join(" ")}`);
  }
  return out.join("\n");
}

function signExtend(value: number, bits: number): number {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

export function bigIntToNumber(v: bigint): number {
  return Number(v);
}

/** Guard against absurd allocation while keeping the browser alive. */
export function bytesFromBuffer(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

/* ------------------------------------------------------------------ *
 * ELF
 * ------------------------------------------------------------------ */

const ELF_MACHINE: Record<number, string> = {
  0: "none",
  2: "sparc",
  3: "x86",
  8: "mips",
  20: "powerpc",
  21: "powerpc64",
  40: "arm",
  42: "sh",
  50: "ia64",
  62: "x86_64",
  83: "avr",
  183: "aarch64",
  243: "riscv",
  247: "bpf",
};

const ELF_TYPE: Record<number, string> = {
  1: "REL (relocatable)",
  2: "EXEC (executable)",
  3: "DYN (shared object / PIE)",
  4: "CORE (core dump)",
};

const ELF_SECTION_TYPE: Record<number, string> = {
  0: "NULL",
  1: "PROGBITS",
  2: "SYMTAB",
  3: "STRTAB",
  4: "RELA",
  5: "HASH",
  6: "DYNAMIC",
  7: "NOTE",
  8: "NOBITS",
  9: "REL",
  10: "SHLIB",
  11: "DYNSYM",
  14: "INIT_ARRAY",
  15: "FINI_ARRAY",
  16: "PREINIT_ARRAY",
  17: "GROUP",
  18: "SYMTAB_SHNDX",
};

const ELF_PROGRAM_TYPE: Record<number, string> = {
  0: "NULL",
  1: "LOAD",
  2: "DYNAMIC",
  3: "INTERP",
  4: "NOTE",
  5: "SHLIB",
  6: "PHDR",
  7: "TLS",
  0x6474e550: "GNU_EH_FRAME",
  0x6474e551: "GNU_STACK",
  0x6474e552: "GNU_RELRO",
  0x6474e553: "GNU_PROPERTY",
};

function elfFlagsToText(flags: number): string {
  const out: string[] = [];
  if (flags & 0x1) out.push("W");
  if (flags & 0x2) out.push("A");
  if (flags & 0x4) out.push("X");
  if (flags & 0x10) out.push("M");
  if (flags & 0x20) out.push("S");
  if (flags & 0x40) out.push("I");
  if (flags & 0x80) out.push("L");
  if (flags & 0x100) out.push("O");
  if (flags & 0x200) out.push("G");
  if (flags & 0x400) out.push("T");
  return out.join("") || "-";
}

const ELF_SYMBOL_TYPE = [
  "NOTYPE",
  "OBJECT",
  "FUNC",
  "SECTION",
  "FILE",
  "COMMON",
  "TLS",
  "NUM",
];

const ELF_SYMBOL_BIND = ["LOCAL", "GLOBAL", "WEAK", "NUM", "UNIQUE"];

function parseElf(bytes: Uint8Array): ParsedLib {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bits: 32 | 64 = bytes[4] === 2 ? 64 : 32;
  const little = bytes[5] !== 2;
  const endian: "little" | "big" = little ? "little" : "big";

  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const u64 = (o: number) => Number(view.getBigUint64(o, little));

  let eType = 0;
  let eMachine = 0;
  let eEntry = 0;
  let ePhoff = 0;
  let eShoff = 0;
  let ePhentsize = 0;
  let ePhnum = 0;
  let eShentsize = 0;
  let eShnum = 0;
  let eShstrndx = 0;
  let eFlags = 0;

  if (bits === 64) {
    eType = u16(16);
    eMachine = u16(18);
    eEntry = u64(24);
    ePhoff = u64(32);
    eShoff = u64(40);
    eFlags = u32(48);
    ePhentsize = u16(54);
    ePhnum = u16(56);
    eShentsize = u16(58);
    eShnum = u16(60);
    eShstrndx = u16(62);
  } else {
    eType = u16(16);
    eMachine = u16(18);
    eEntry = u32(24);
    ePhoff = u32(28);
    eShoff = u32(32);
    eFlags = u32(36);
    ePhentsize = u16(42);
    ePhnum = u16(44);
    eShentsize = u16(46);
    eShnum = u16(48);
    eShstrndx = u16(50);
  }

  const notes: string[] = [];
  if (eShnum === 0 && eShoff > 0) {
    notes.push("e_shnum is 0 — section headers may have been stripped.");
  }

  /* Sections */
  const sections: LibSection[] = [];
  if (eShoff > 0 && eShentsize > 0 && eShnum > 0 && eShnum < 50000) {
    for (let i = 0; i < eShnum; i++) {
      const base = eShoff + i * eShentsize;
      if (base + eShentsize > bytes.length) break;
      let nameIdx = 0;
      let type = 0;
      let flags = 0;
      let addr = 0;
      let offset = 0;
      let size = 0;
      let entsize = 0;
      let align = 0;
      if (bits === 64) {
        nameIdx = u32(base);
        type = u32(base + 4);
        flags = u64(base + 8);
        addr = u64(base + 16);
        offset = u64(base + 24);
        size = u64(base + 32);
        entsize = u64(base + 56);
        align = u64(base + 48);
      } else {
        nameIdx = u32(base);
        type = u32(base + 4);
        flags = u32(base + 8);
        addr = u32(base + 12);
        offset = u32(base + 16);
        size = u32(base + 20);
        entsize = u32(base + 36);
        align = u32(base + 32);
      }
      sections.push({
        index: i,
        name: `sec_${i}`,
        kind: ELF_SECTION_TYPE[type] ?? `0x${type.toString(16)}`,
        flags: elfFlagsToText(flags),
        addr,
        offset,
        size,
        entsize,
        align,
        segment: "",
      });
      sectionNameIndex[i] = nameIdx;
    }
  }

  const shstrtab = sections[eShstrndx];
  if (shstrtab) {
    for (let i = 0; i < sections.length; i++) {
      const idx = sectionNameIndex[i] ?? 0;
      const name = readCString(bytes, shstrtab.offset + idx, 256);
      if (name) sections[i].name = name;
    }
  }

  /* Program headers / segments */
  const segments: LibSegment[] = [];
  let imageBase = Number.MAX_SAFE_INTEGER;
  if (ePhoff > 0 && ePhentsize > 0 && ePhnum > 0 && ePhnum < 20000) {
    for (let i = 0; i < ePhnum; i++) {
      const base = ePhoff + i * ePhentsize;
      if (base + ePhentsize > bytes.length) break;
      let type = 0;
      let flags = 0;
      let offset = 0;
      let vaddr = 0;
      let filesz = 0;
      let memsz = 0;
      if (bits === 64) {
        type = u32(base);
        flags = u32(base + 4);
        offset = u64(base + 8);
        vaddr = u64(base + 16);
        filesz = u64(base + 32);
        memsz = u64(base + 40);
      } else {
        type = u32(base);
        offset = u32(base + 4);
        vaddr = u32(base + 8);
        filesz = u32(base + 16);
        memsz = u32(base + 20);
        flags = u32(base + 24);
      }
      segments.push({
        index: i,
        name: `${ELF_PROGRAM_TYPE[type] ?? `0x${type.toString(16)}`}`,
        vmaddr: vaddr,
        vmsize: memsz,
        fileoff: offset,
        filesize: filesz,
        initprot: flags,
        maxprot: flags,
        flag: elfFlagsToText(flags),
      });
      if (type === 1 && vaddr > 0 && vaddr < imageBase) imageBase = vaddr;
    }
  }
  if (!Number.isFinite(imageBase) || imageBase === Number.MAX_SAFE_INTEGER) {
    const dyn = sections.find((s) => s.addr > 0);
    imageBase = dyn?.addr ?? 0;
  }

  /* Symbols */
  const symbols: LibSymbol[] = [];
  const imports: string[] = [];
  const exports: string[] = [];
  for (const sec of sections) {
    if (sec.kind !== "SYMTAB" && sec.kind !== "DYNSYM") continue;
    const link = sectionLinkIndex[sec.index] ?? 0;
    const strtab = sections[link];
    if (!strtab) continue;
    const count = sec.entsize > 0 ? Math.floor(sec.size / sec.entsize) : 0;
    for (let i = 0; i < count; i++) {
      const base = sec.offset + i * sec.entsize;
      if (base + sec.entsize > bytes.length) break;
      let nameIdx = 0;
      let value = 0;
      let size = 0;
      let info = 0;
      let shndx = 0;
      if (bits === 64) {
        nameIdx = u32(base);
        info = bytes[base + 4];
        shndx = u16(base + 6);
        value = u64(base + 8);
        size = u64(base + 16);
      } else {
        nameIdx = u32(base);
        value = u32(base + 4);
        size = u32(base + 8);
        info = bytes[base + 12];
        shndx = u16(base + 14);
      }
      const name = readCString(bytes, strtab.offset + nameIdx, 512);
      if (!name) continue;
      const bind = ELF_SYMBOL_BIND[info >> 4] ?? "LOCAL";
      const kind = ELF_SYMBOL_TYPE[info & 0xf] ?? "NOTYPE";
      symbols.push({
        index: symbols.length,
        name,
        value,
        size,
        bind,
        kind,
        section: shndx === 0 ? "UND" : sections[shndx]?.name ?? `#${shndx}`,
        external: bind !== "LOCAL",
        offset: vaddrToFileOffsetRaw(segments, value),
      });
      if (shndx === 0 && kind === "FUNC") imports.push(name);
      else if (bind !== "LOCAL" && kind === "FUNC") exports.push(name);
    }
  }

  return {
    format: "ELF",
    arch: ELF_MACHINE[eMachine] ?? `machine_${eMachine}`,
    bits,
    endian,
    entry: eEntry,
    imageBase: imageBase === Number.MAX_SAFE_INTEGER ? 0 : imageBase,
    bytes,
    fields: [
      { key: "e_type", value: ELF_TYPE[eType] ?? `${eType}` },
      { key: "e_machine", value: `${ELF_MACHINE[eMachine] ?? eMachine} (${eMachine})` },
      { key: "e_entry", value: hex(eEntry) },
      { key: "e_flags", value: hex(eFlags) },
      { key: "e_phoff", value: hex(ePhoff) },
      { key: "e_shoff", value: hex(eShoff) },
      { key: "phentsize / phnum", value: `${ePhentsize} / ${ePhnum}` },
      { key: "shentsize / shnum", value: `${eShentsize} / ${eShnum}` },
      { key: "shstrndx", value: `${eShstrndx}` },
    ],
    segments,
    sections,
    symbols,
    imports,
    exports,
    notes,
  };
}

/* ------------------------------------------------------------------ *
 * Mach-O
 * ------------------------------------------------------------------ */

const CPU_TYPE: Record<number, string> = {
  7: "i386",
  0x01000007: "x86_64",
  12: "arm",
  0x0100000c: "arm64",
  0x0200000c: "arm64e",
  18: "ppc",
  0x01000012: "ppc64",
};

const MACH_FILE_TYPE: Record<number, string> = {
  1: "OBJECT",
  2: "EXECUTE",
  3: "FVMLIB",
  4: "CORE",
  5: "PRELOAD",
  6: "DYLIB",
  7: "DYLINKER",
  8: "BUNDLE",
  9: "DYLIB_STUB",
  10: "DSYM",
  11: "KEXT_BUNDLE",
};

interface MachSlice {
  cputype: number;
  cpusubtype: number;
  offset: number;
  size: number;
}

function parseMachO(bytes: Uint8Array, sliceStart = 0, sliceEnd = bytes.length): {
  parsed: ParsedLib;
  slices: MachSlice[];
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(sliceStart, false);
  const little =
    magic === 0xcefaedfe || magic === 0xcffaedfe
      ? true
      : magic === 0xfeedface || magic === 0xfeedfacf
        ? false
        : true;
  const is64 = magic === 0xfeedfacf || magic === 0xcffaedfe;
  const u32 = (o: number) => view.getUint32(o, little);
  const u64 = (o: number) => Number(view.getBigUint64(o, little));

  const cputype = u32(sliceStart + 4);
  const cpusubtype = u32(sliceStart + 8);
  const filetype = u32(sliceStart + 12);
  const ncmds = u32(sliceStart + 16);
  const sizeofcmds = u32(sliceStart + 20);
  const hdrSize = is64 ? 32 : 28;

  let entry = 0;
  const notes: string[] = [];
  const segments: LibSegment[] = [];
  const sections: LibSection[] = [];
  const imports: string[] = [];
  const exports: string[] = [];

  let symoff = 0;
  let nsyms = 0;
  let stroff = 0;
  let strsize = 0;
  const sectionsAll: Array<Omit<LibSection, "index">> = [];

  if (ncmds > 0 && ncmds < 20000 && sizeofcmds > 0) {
    let cursor = sliceStart + hdrSize;
    for (let i = 0; i < ncmds; i++) {
      if (cursor + 8 > sliceEnd) break;
      const cmd = u32(cursor);
      const cmdsize = u32(cursor + 4);
      if (cmdsize < 8 || cursor + cmdsize > sliceEnd) break;

      if (cmd === 0x1 || cmd === 0x19) {
        const is64Seg = cmd === 0x19;
        const name = readCString(bytes, cursor + 8, 16);
        let vmaddr: number;
        let vmsize: number;
        let fileoff: number;
        let filesize: number;
        let initprot: number;
        let maxprot: number;
        let nsects: number;
        let sectCursor: number;
        if (is64Seg) {
          vmaddr = u64(cursor + 24);
          vmsize = u64(cursor + 32);
          fileoff = u64(cursor + 40);
          filesize = u64(cursor + 48);
          maxprot = u32(cursor + 56);
          initprot = u32(cursor + 60);
          nsects = u32(cursor + 64);
          sectCursor = cursor + 72;
        } else {
          vmaddr = u32(cursor + 24);
          vmsize = u32(cursor + 28);
          fileoff = u32(cursor + 32);
          filesize = u32(cursor + 36);
          maxprot = u32(cursor + 40);
          initprot = u32(cursor + 44);
          nsects = u32(cursor + 48);
          sectCursor = cursor + 56;
        }
        segments.push({
          index: segments.length,
          name,
          vmaddr,
          vmsize,
          fileoff,
          filesize,
          initprot,
          maxprot,
          flag: vmProt(initprot),
        });
        const secSize = is64Seg ? 80 : 68;
        for (let s = 0; s < nsects && s < 20000; s++) {
          const base = sectCursor + s * secSize;
          if (base + secSize > cursor + cmdsize) break;
          const sectname = readCString(bytes, base, 16);
          const segname = readCString(bytes, base + 16, 16);
          let addr: number;
          let size: number;
          let offset: number;
          let flags: number;
          if (is64Seg) {
            addr = u64(base + 32);
            size = u64(base + 40);
            offset = u32(base + 48);
            flags = u32(base + 64);
          } else {
            addr = u32(base + 32);
            size = u32(base + 36);
            offset = u32(base + 40);
            flags = u32(base + 56);
          }
          sectionsAll.push({
            name: sectname,
            kind: machSectionKind(sectname),
            flags: `0x${flags.toString(16)}`,
            addr,
            offset,
            size,
            entsize: 0,
            align: 0,
            segment: segname,
          });
        }
      } else if (cmd === 0x2) {
        symoff = u32(cursor + 8);
        nsyms = u32(cursor + 12);
        stroff = u32(cursor + 16);
        strsize = u32(cursor + 20);
      } else if (cmd === 0x80000028) {
        // LC_MAIN
        entry = u64(cursor + 8);
      } else if (cmd === 0x25 || cmd === 0x24) {
        // LC_VERSION_MIN_IPHONEOS / MACOSX
        const v = u32(cursor + 8);
        notes.push(`minimum OS ${(v >> 16) & 0xffff}.${(v >> 8) & 0xff}`);
      } else if (cmd === 0x32) {
        const platform = u32(cursor + 8);
        notes.push(`platform id ${platform} (build version command)`);
      }
      cursor += cmdsize;
    }
  }

  sections.push(
    ...sectionsAll.map((s, i) => ({ ...s, index: i })),
  );

  const imageBase =
    segments.find((s) => s.fileoff === 0 && s.vmaddr > 0)?.vmaddr ??
    segments.find((s) => s.vmaddr > 0)?.vmaddr ??
    0;

  const symbols: LibSymbol[] = [];
  if (symoff > 0 && nsyms > 0 && nsyms < 800000) {
    const entrySize = is64 ? 16 : 12;
    for (let i = 0; i < nsyms; i++) {
      const base = symoff + i * entrySize;
      if (base + entrySize > bytes.length) break;
      const strx = u32(base);
      const nType = bytes[base + 4];
      const nSect = bytes[base + 5];
      let nValue: number;
      if (is64) nValue = u64(base + 8);
      else nValue = u32(base + 8);
      const kind = (nType & 0x0e) >> 1;
      const external = (nType & 0x01) === 1;
      if ((nType & 0xe0) === 0x0e) continue; // debug symbol
      const name = readCString(bytes, stroff + strx, 512);
      if (!name) continue;
      const sectName = nSect > 0 ? sections[nSect - 1]?.name ?? `#${nSect}` : "UND";
      const kindName = kind === 0xf ? "SECTION" : kind === 0x1 ? "FUNC" : kind === 0x0 ? "UNDF" : "ABS";
      symbols.push({
        index: symbols.length,
        name,
        value: nValue,
        size: 0,
        bind: external ? "GLOBAL" : "LOCAL",
        kind: kindName === "FUNC" ? "FUNC" : kindName,
        section: sectName,
        external,
        offset: vaddrToFileOffsetRaw(segments, nValue),
      });
      if (external) {
        if (nValue === 0) imports.push(name);
        else exports.push(name);
      }
    }
  }

  return {
    parsed: {
      format: "Mach-O",
      arch: CPU_TYPE[cputype] ?? `cpu_${cputype}`,
      bits: is64 ? 64 : 32,
      endian: little ? "little" : "big",
      entry,
      imageBase,
      bytes,
      fields: [
        { key: "magic", value: hex(magic) },
        { key: "cputype", value: `${CPU_TYPE[cputype] ?? cputype} (sub ${cpusubtype})` },
        { key: "filetype", value: MACH_FILE_TYPE[filetype] ?? `${filetype}` },
        { key: "ncmds", value: `${ncmds}` },
        { key: "sizeofcmds", value: `${sizeofcmds} bytes` },
        { key: "LC_SYMTAB", value: `symoff ${hex(symoff)} · ${nsyms} symbols` },
        { key: "strtab", value: `off ${hex(stroff)} · ${strsize} bytes` },
      ],
      segments,
      sections,
      symbols,
      imports,
      exports,
      notes,
    },
    slices: [{ cputype, cpusubtype, offset: sliceStart, size: sliceEnd - sliceStart }],
  };
}

function vmProt(prot: number): string {
  const out: string[] = [];
  if (prot & 1) out.push("R");
  if (prot & 2) out.push("W");
  if (prot & 4) out.push("X");
  return out.join("") || "-";
}

function machSectionKind(name: string): string {
  if (name.startsWith("__text")) return "TEXT";
  if (name.startsWith("__cstring") || name.startsWith("__const")) return "CSTR";
  if (name.includes("stubs")) return "STUBS";
  if (name.includes("la_symbol_ptr") || name.includes("nl_symbol_ptr")) return "POINTER";
  if (name.includes("data")) return "DATA";
  return "SECT";
}

/* ------------------------------------------------------------------ *
 * PE (best effort — enough for offsets + exports)
 * ------------------------------------------------------------------ */

function parsePe(bytes: Uint8Array): ParsedLib {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const peOff = view.getUint32(0x3c, true);
  const machine = view.getUint16(peOff + 4, true);
  const numSections = view.getUint16(peOff + 6, true);
  const sizeOfOptional = view.getUint16(peOff + 20, true);
  const optOff = peOff + 24;
  const magic = view.getUint16(optOff, true);
  const bits: 32 | 64 = magic === 0x20b ? 64 : 32;
  const entryRva = view.getUint32(optOff + 16, true);
  const imageBase =
    bits === 64
      ? Number(view.getBigUint64(optOff + 24, true))
      : view.getUint32(optOff + 28, true);

  const MACHINE: Record<number, string> = {
    0x14c: "x86",
    0x8664: "x86_64",
    0x1c0: "arm",
    0xaa64: "arm64",
  };

  const sections: LibSection[] = [];
  const secOff = optOff + sizeOfOptional;
  for (let i = 0; i < numSections; i++) {
    const base = secOff + i * 40;
    if (base + 40 > bytes.length) break;
    const name = readCString(bytes, base, 8);
    const vsize = view.getUint32(base + 8, true);
    const vaddr = view.getUint32(base + 12, true);
    const size = view.getUint32(base + 16, true);
    const offset = view.getUint32(base + 20, true);
    const chars = view.getUint32(base + 36, true);
    sections.push({
      index: i,
      name,
      kind: chars & 0x20000000 ? "CODE" : chars & 0x80000000 ? "BSS" : "DATA",
      flags: `0x${chars.toString(16)}`,
      addr: imageBase + vaddr,
      offset,
      size: size || vsize,
      entsize: 0,
      align: 0,
      segment: name,
    });
  }

  return {
    format: "PE",
    arch: MACHINE[machine] ?? `machine_${machine}`,
    bits,
    endian: "little",
    entry: imageBase + entryRva,
    imageBase,
    bytes,
    fields: [
      { key: "machine", value: `${MACHINE[machine] ?? machine}` },
      { key: "opt magic", value: hex(magic) },
      { key: "entry RVA", value: hex(entryRva) },
      { key: "image base", value: hex(imageBase) },
      { key: "sections", value: `${numSections}` },
    ],
    segments: [],
    sections,
    symbols: [],
    imports: [],
    exports: [],
    notes: ["PE import/export directory parsing is limited — sections + RVA mapping available."],
  };
}

/* ------------------------------------------------------------------ *
 * Shared containers (kept module-scoped so the ELF walker can see them)
 * ------------------------------------------------------------------ */

const sectionNameIndex: number[] = [];
const sectionLinkIndex: number[] = [];

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export function parseLib(raw: Uint8Array): ParsedLib {
  sectionNameIndex.length = 0;
  sectionLinkIndex.length = 0;

  if (raw.length < 16) {
    return emptyLib(raw, "File is too small to be a library.");
  }

  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const b0 = raw[0];
  const b1 = raw[1];
  const b2 = raw[2];
  const b3 = raw[3];

  // ELF
  if (b0 === 0x7f && b1 === 0x45 && b2 === 0x4c && b3 === 0x46) {
    return parseElfWithLinks(raw);
  }

  // Mach-O thin
  const be = view.getUint32(0, false);
  if (
    be === 0xfeedface ||
    be === 0xfeedfacf ||
    view.getUint32(0, true) === 0xfeedface ||
    view.getUint32(0, true) === 0xfeedfacf
  ) {
    return parseMachO(raw).parsed;
  }

  // Mach-O universal / fat
  if (be === 0xcafebabe || be === 0xcafebabf || be === 0xbebafeca || be === 0xbfbafeca) {
    return parseFatMachO(raw, view, be);
  }

  // PE
  if (b0 === 0x4d && b1 === 0x5a && raw.length > 0x40) {
    try {
      return parsePe(raw);
    } catch {
      return emptyLib(raw, "MZ header found but the PE directory could not be parsed.");
    }
  }

  // Maybe raw shellcode / blob
  return rawBlob(raw);
}

function parseElfWithLinks(raw: Uint8Array): ParsedLib {
  // Fill the module-scoped name/link tables during the ELF walk.
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const bits: 32 | 64 = raw[4] === 2 ? 64 : 32;
  const little = raw[5] !== 2;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const u64 = (o: number) => Number(view.getBigUint64(o, little));

  const eShoff = bits === 64 ? u64(40) : u32(32);
  const eShentsize = bits === 64 ? u16(58) : u16(46);
  const eShnum = bits === 64 ? u16(60) : u16(48);
  for (let i = 0; i < eShnum && i < 50000; i++) {
    const base = eShoff + i * eShentsize;
    if (base + eShentsize > raw.length) break;
    sectionNameIndex[i] = u32(base);
    sectionLinkIndex[i] = bits === 64 ? u32(base + 40) : u32(base + 24);
  }
  return parseElf(raw);
}

function parseFatMachO(
  raw: Uint8Array,
  view: DataView,
  magic: number,
): ParsedLib {
  const swap = magic === 0xbebafeca || magic === 0xbfbafeca;
  const is64 = magic === 0xcafebabf || magic === 0xbfbafeca;
  const nfat = view.getUint32(4, swap);
  const entrySize = is64 ? 32 : 20;

  const slices: MachSlice[] = [];
  for (let i = 0; i < nfat && i < 64; i++) {
    const base = 8 + i * entrySize;
    if (base + entrySize > raw.length) break;
    const cputype = view.getUint32(base, swap);
    const cpusubtype = view.getUint32(base + 4, swap);
    const offset = is64
      ? Number(view.getBigUint64(base + 8, swap))
      : view.getUint32(base + 8, swap);
    const size = is64
      ? Number(view.getBigUint64(base + 16, swap))
      : view.getUint32(base + 12, swap);
    slices.push({ cputype, cpusubtype, offset, size });
  }

  if (slices.length === 0) return emptyLib(raw, "Universal binary header contained no slices.");

  // Parse the slice with the biggest text payload (usually arm64 first).
  const chosen = slices[0];
  const sub = raw.subarray(chosen.offset, Math.min(raw.length, chosen.offset + chosen.size));
  const inner = parseMachO(raw, chosen.offset, Math.min(raw.length, chosen.offset + chosen.size));
  const parsed = inner.parsed;
  parsed.format = "Mach-O Fat";
  parsed.notes = [
    ...parsed.notes,
    `Universal binary with ${slices.length} architecture slice(s): ${slices
      .map((s) => `${CPU_TYPE[s.cputype] ?? s.cputype} @ ${hex(s.offset)}`)
      .join(", ")}`,
  ];
  parsed.fields = [{ key: "fat slices", value: `${slices.length}` }, ...parsed.fields];
  if (sub.length === 0) parsed.notes.push("Selected slice was empty.");
  return parsed;
}

function emptyLib(raw: Uint8Array, note: string): ParsedLib {
  return {
    format: "Unknown",
    arch: "unknown",
    bits: 64,
    endian: "little",
    entry: 0,
    imageBase: 0,
    bytes: raw,
    fields: [],
    segments: [],
    sections: [],
    symbols: [],
    imports: [],
    exports: [],
    notes: [note],
  };
}

function rawBlob(raw: Uint8Array): ParsedLib {
  return {
    ...emptyLib(raw, "Not a recognised container. Treating the file as a raw blob — hex, search, patch and signature tools are still fully available."),
    format: "Unknown",
  };
}

/* ------------------------------------------------------------------ *
 * Address mapping / analysis helpers
 * ------------------------------------------------------------------ */

function vaddrToFileOffsetRaw(segments: LibSegment[], vaddr: number): number {
  for (const seg of segments) {
    if (seg.vmaddr <= vaddr && vaddr < seg.vmaddr + seg.vmsize && seg.filesize > 0) {
      return seg.fileoff + (vaddr - seg.vmaddr);
    }
  }
  return 0;
}

export function vaddrToOffset(lib: ParsedLib, vaddr: number): number | null {
  if (lib.segments.length > 0) {
    const hit = vaddrToFileOffsetRaw(lib.segments, vaddr);
    if (hit > 0) return hit;
  }
  for (const sec of lib.sections) {
    if (sec.addr > 0 && vaddr >= sec.addr && vaddr < sec.addr + Math.max(sec.size, 1)) {
      return sec.offset + (vaddr - sec.addr);
    }
  }
  return null;
}

export function offsetToVaddr(lib: ParsedLib, offset: number): number | null {
  for (const seg of lib.segments) {
    if (seg.filesize > 0 && offset >= seg.fileoff && offset < seg.fileoff + seg.filesize) {
      return seg.vmaddr + (offset - seg.fileoff);
    }
  }
  for (const sec of lib.sections) {
    if (sec.size > 0 && offset >= sec.offset && offset < sec.offset + sec.size) {
      return sec.addr + (offset - sec.offset);
    }
  }
  return null;
}

export function sectionForOffset(lib: ParsedLib, offset: number): LibSection | null {
  for (const sec of lib.sections) {
    if (sec.size > 0 && offset >= sec.offset && offset < sec.offset + sec.size) return sec;
  }
  return null;
}

export interface HarvesterOptions {
  minLength: number;
  limit?: number;
}

export function extractStrings(bytes: Uint8Array, opts: HarvesterOptions): LibString[] {
  const { minLength, limit = 5000 } = opts;
  const out: LibString[] = [];
  let start = -1;
  for (let i = 0; i < bytes.length && out.length < limit; i++) {
    const b = bytes[i];
    const printable = b >= 0x20 && b < 0x7f;
    if (printable) {
      if (start < 0) start = i;
    } else {
      if (start >= 0 && i - start >= minLength) {
        out.push({ offset: start, value: textDecoder.decode(bytes.subarray(start, i)) });
      }
      start = -1;
    }
  }
  if (start >= 0 && bytes.length - start >= minLength) {
    out.push({ offset: start, value: textDecoder.decode(bytes.subarray(start)) });
  }
  return out;
}

export interface PatternMatch {
  offset: number;
}

export interface ParsedPattern {
  tokens: (number | null)[];
  error?: string;
}

/** Accepts "48 8B ?? E0", "488B??E0" or "48 8b ? e0". */
export function parsePattern(input: string): ParsedPattern {
  const cleaned = input.replace(/0x/gi, "").replace(/[\s,;-]/g, "");
  if (!cleaned) return { tokens: [], error: "Enter a byte pattern." };
  if (!/^[0-9a-f?]+$/i.test(cleaned)) {
    return { tokens: [], error: "Pattern may only contain hex digits and ? wildcards." };
  }
  const tokens: (number | null)[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (ch === "?") {
      tokens.push(null);
      i += 1;
      continue;
    }
    if (i + 1 >= cleaned.length) {
      return { tokens: [], error: "Pattern has an odd number of hex digits." };
    }
    const pair = cleaned.slice(i, i + 2);
    if (pair.includes("?")) {
      const first = hexDigitValue(pair[0]);
      if (first === null) return { tokens: [], error: `Bad byte "${pair}".` };
      tokens.push(first << 4);
      i += 2;
      continue;
    }
    const val = Number.parseInt(pair, 16);
    if (Number.isNaN(val)) return { tokens: [], error: `Bad byte "${pair}".` };
    tokens.push(val);
    i += 2;
  }
  return { tokens };
}

function hexDigitValue(ch: string): number | null {
  const v = Number.parseInt(ch, 16);
  return Number.isNaN(v) ? null : v;
}

export function searchPattern(
  bytes: Uint8Array,
  pattern: ParsedPattern,
  limit = 500,
): PatternMatch[] {
  const { tokens } = pattern;
  if (tokens.length === 0) return [];
  const out: PatternMatch[] = [];
  const last = bytes.length - tokens.length;
  for (let i = 0; i <= last && out.length < limit; i++) {
    let ok = true;
    for (let j = 0; j < tokens.length; j++) {
      const want = tokens[j];
      if (want === null) continue;
      const got = bytes[i + j];
      if (want !== got) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ offset: i });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Patch editor
 * ------------------------------------------------------------------ */

export interface BytePatch {
  offset: number;
  hex: string;
}

export interface PatchResult {
  bytes: Uint8Array;
  applied: number;
  errors: string[];
}

export function applyPatches(bytes: Uint8Array, patches: BytePatch[]): PatchResult {
  const out = new Uint8Array(bytes);
  const errors: string[] = [];
  let applied = 0;
  for (const patch of patches) {
    const parsed = parsePattern(patch.hex);
    if (parsed.error || parsed.tokens.length === 0) {
      errors.push(`Patch @ ${hex(patch.offset)}: ${parsed.error ?? "empty"}`);
      continue;
    }
    if (patch.offset < 0 || patch.offset + parsed.tokens.length > out.length) {
      errors.push(`Patch @ ${hex(patch.offset)} is outside the file.`);
      continue;
    }
    for (let i = 0; i < parsed.tokens.length; i++) {
      const val = parsed.tokens[i];
      if (val === null) continue;
      out[patch.offset + i] = val;
    }
    applied++;
  }
  return { bytes: out, applied, errors };
}

/* ------------------------------------------------------------------ *
 * Lite disassembler (arm64) — a fast hexdump-style listing
 * ------------------------------------------------------------------ */

const ARM64_CONDS = [
  "eq", "ne", "cs", "cc", "mi", "pl", "vs", "vc",
  "hi", "ls", "ge", "lt", "gt", "le", "al", "nv",
];

export interface DisasmLine {
  offset: number;
  vaddr: number | null;
  raw: string;
  text: string;
}

export function decodeArm64(word: number, pc: number): string {
  const w = word >>> 0;
  if (w === 0xd503201f) return "nop";
  if (w === 0xd503233f) return "paciasp";
  if (w === 0xd50323bf) return "autiasp";
  if (w === 0xd503237f) return "pacibsp";
  if (w === 0xd50323ff) return "autibsp";
  if (w === 0xd65f03c0) return "ret";
  if (((w & 0xfffffc1f) >>> 0) === 0xd65f0000) {
    const rn = (w >>> 5) & 0x1f;
    return rn === 30 ? "ret" : `ret x${rn}`;
  }
  if (((w & 0xfffffc1f) >>> 0) === 0xd61f0000) return `br x${(w >>> 5) & 0x1f}`;
  if (((w & 0xfffffc1f) >>> 0) === 0xd63f0000) return `blr x${(w >>> 5) & 0x1f}`;
  if (((w & 0xfffffc1f) >>> 0) === 0xd65f0010) return "retab";

  if (((w & 0xfc000000) >>> 0) === 0x14000000) {
    const imm = signExtend(w & 0x03ffffff, 26) << 2;
    return `b ${hex(pc + imm)}`;
  }
  if (((w & 0xfc000000) >>> 0) === 0x94000000) {
    const imm = signExtend(w & 0x03ffffff, 26) << 2;
    return `bl ${hex(pc + imm)}`;
  }
  if (((w & 0xff000010) >>> 0) === 0x54000000) {
    const cond = ARM64_CONDS[w & 0xf];
    const imm = signExtend((w >>> 5) & 0x7ffff, 19) << 2;
    return `b.${cond} ${hex(pc + imm)}`;
  }
  if (((w & 0x7e000000) >>> 0) === 0x34000000 || ((w & 0x7e000000) >>> 0) === 0x35000000) {
    const cbnz = (w >>> 24) & 1;
    const size = (w >>> 31) & 1;
    const rt = w & 0x1f;
    const imm = signExtend((w >>> 5) & 0x7ffff, 19) << 2;
    return `${cbnz ? "cbnz" : "cbz"} ${size ? "x" : "w"}${rt}, ${hex(pc + imm)}`;
  }
  if (((w & 0x7e000000) >>> 0) === 0x36000000 || ((w & 0x7e000000) >>> 0) === 0x37000000) {
    const tbnz = (w >>> 24) & 1;
    const bit = ((w >>> 31) << 5) | ((w >>> 19) & 0x1f);
    const rt = w & 0x1f;
    const imm = signExtend((w >>> 5) & 0x3fff, 14) << 2;
    return `${tbnz ? "tbnz" : "tbz"} x${rt}, #${bit}, ${hex(pc + imm)}`;
  }
  if (((w & 0x9f000000) >>> 0) === 0x10000000) {
    const immlo = (w >>> 29) & 0x3;
    const immhi = (w >>> 5) & 0x7ffff;
    const imm = signExtend((immhi << 2) | immlo, 21);
    return `adr x${w & 0x1f}, ${hex(pc + imm)}`;
  }
  if (((w & 0x9f000000) >>> 0) === 0x90000000) {
    const immlo = (w >>> 29) & 0x3;
    const immhi = (w >>> 5) & 0x7ffff;
    const imm = signExtend((immhi << 2) | immlo, 21) << 12;
    // page-align without bitwise ops: addresses can exceed 2^32
    const pageBase = Math.floor(pc / 0x1000) * 0x1000;
    return `adrp x${w & 0x1f}, ${hex(pageBase + imm)}`;
  }

  // add/sub immediate
  if (((w & 0x1f000000) >>> 0) === 0x11000000 || ((w & 0x1f000000) >>> 0) === 0x51000000) {
    const sub = (w & 0x40000000) !== 0;
    const sf = (w >>> 31) & 1;
    const s = (w >>> 29) & 1;
    const shift = (w >>> 22) & 3;
    const imm12 = (w >>> 10) & 0xfff;
    const rn = (w >>> 5) & 0x1f;
    const rd = w & 0x1f;
    const amount = shift === 1 ? imm12 << 12 : imm12;
    const mnemonic = s ? (sub ? "cmp" : "cmn") : sub ? "sub" : "add";
    const reg = (n: number) => (sf ? (n === 31 ? "sp" : `x${n}`) : n === 31 ? "wzr" : `w${n}`);
    if (s) return `${mnemonic} ${reg(rn)}, #${amount}${shift === 1 ? ", lsl #12" : ""}`;
    return `${mnemonic} ${reg(rd)}, ${reg(rn)}, #${amount}${shift === 1 ? ", lsl #12" : ""}`;
  }

  // add/sub shifted register
  if (((w & 0x1f200000) >>> 0) === 0x0b000000 || ((w & 0x1f200000) >>> 0) === 0x4b000000) {
    const sub = (w & 0x40000000) !== 0;
    const sf = (w >>> 31) & 1;
    const s = (w >>> 29) & 1;
    const rm = (w >>> 16) & 0x1f;
    const rn = (w >>> 5) & 0x1f;
    const rd = w & 0x1f;
    const reg = (n: number) => (sf ? (n === 31 ? "xzr" : `x${n}`) : n === 31 ? "wzr" : `w${n}`);
    const mnemonic = s ? (sub ? "cmp" : "cmn") : sub ? "sub" : "add";
    if (s) return `${mnemonic} ${reg(rn)}, ${reg(rm)}`;
    return `${mnemonic} ${reg(rd)}, ${reg(rn)}, ${reg(rm)}`;
  }

  // movz / movn / movk
  if (
    ((w & 0x7f800000) >>> 0) === 0x52800000 ||
    ((w & 0x7f800000) >>> 0) === 0x12800000 ||
    ((w & 0x7f800000) >>> 0) === 0x72800000
  ) {
    const sf = (w >>> 31) & 1;
    const opc = (w >>> 29) & 0x3;
    const hw = (w >>> 21) & 0x3;
    const imm16 = (w >>> 5) & 0xffff;
    const rd = w & 0x1f;
    const reg = sf ? `x${rd}` : `w${rd}`;
    const name = opc === 0 ? "movn" : opc === 2 ? "movz" : "movk";
    const shift = hw * 16;
    if (opc === 2 && shift === 0) return `mov ${reg}, #${hex(imm16)}`;
    return `${name} ${reg}, #${hex(imm16)}${shift ? `, lsl #${shift}` : ""}`;
  }

  // orr shifted register (mov alias)
  if (((w & 0x7fe00000) >>> 0) === 0x2a000000) {
    const sf = (w >>> 31) & 1;
    const rm = (w >>> 16) & 0x1f;
    const rn = (w >>> 5) & 0x1f;
    const rd = w & 0x1f;
    const reg = (n: number) => (sf ? (n === 31 ? "xzr" : `x${n}`) : n === 31 ? "wzr" : `w${n}`);
    if (rn === 31) return `mov ${reg(rd)}, ${reg(rm)}`;
    return `orr ${reg(rd)}, ${reg(rn)}, ${reg(rm)}`;
  }

  // load/store unsigned offset
  if (((w & 0x3f000000) >>> 0) === 0x39000000) {
    const size = (w >>> 30) & 0x3;
    const opc = (w >>> 22) & 0x3;
    const imm12 = (w >>> 10) & 0xfff;
    const rn = (w >>> 5) & 0x1f;
    const rt = w & 0x1f;
    const off = imm12 << size;
    const rnReg = rn === 31 ? "sp" : `x${rn}`;
    const operand = `[${rnReg}${off ? `, #${off}` : ""}]`;
    if (opc === 2) {
      // PRFM (size 3) or sign-extending load
      return size === 3
        ? `prfm #0, ${operand}`
        : `ldrsw w${rt}, ${operand}`;
    }
    const name = opc === 0 ? "str" : "ldr";
    const mnemonic = size === 0 ? `${name}b` : size === 1 ? `${name}h` : name;
    const reg = size === 3 ? `x${rt}` : `w${rt}`;
    return `${mnemonic} ${reg}, ${operand}`;
  }

  // load literal
  if (((w & 0x3f000000) >>> 0) === 0x18000000) {
    const opc = (w >>> 30) & 0x3;
    const imm19 = signExtend((w >>> 5) & 0x7ffff, 19) << 2;
    const rt = w & 0x1f;
    const reg = opc === 1 ? `x${rt}` : opc === 0 ? `w${rt}` : "x";
    const name = opc === 2 ? "ldrsw" : "ldr";
    return `${name} ${reg}, ${hex(pc + imm19)}`;
  }

  return `.word 0x${hexPad(w, 8)}`;
}

/* ---------------- x86 / x86-64 lite decoder ---------------- */

const X86_R64 = ["rax", "rcx", "rdx", "rbx", "rsp", "rbp", "rsi", "rdi", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15"];
const X86_R32 = ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi", "r8d", "r9d", "r10d", "r11d", "r12d", "r13d", "r14d", "r15d"];
const X86_R16 = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di", "r8w", "r9w", "r10w", "r11w", "r12w", "r13w", "r14w", "r15w"];
const X86_R8 = ["al", "cl", "dl", "bl", "spl", "bpl", "sil", "dil", "r8b", "r9b", "r10b", "r11b", "r12b", "r13b", "r14b", "r15b"];
const X86_CC = ["o", "no", "b", "ae", "e", "ne", "be", "a", "s", "ns", "p", "np", "l", "ge", "le", "g"];

export interface X86Instruction {
  text: string;
  size: number;
}

function x86Reg(index: number, size: "64" | "32" | "16" | "8"): string {
  const i = index & 15;
  if (size === "64") return X86_R64[i];
  if (size === "32") return X86_R32[i];
  if (size === "16") return X86_R16[i];
  return X86_R8[i];
}

/** A deliberately compact single-instruction decoder — prologues, calls, jumps and data ops. */
export function decodeX86(bytes: Uint8Array, offset: number): X86Instruction {
  if (offset >= bytes.length) return { text: "", size: 1 };
  let p = offset;
  let prefix66 = false;
  let prefixF3 = false;
  let rex = 0;

  for (let guard = 0; guard < 6; guard++) {
    const b = bytes[p];
    if (b === undefined) return { text: `.byte`, size: 1 };
    if (b === 0x66) {
      prefix66 = true;
      p++;
      continue;
    }
    if (b === 0xf3) {
      prefixF3 = true;
      p++;
      continue;
    }
    if (
      b === 0xf2 ||
      b === 0xf0 ||
      b === 0x2e ||
      b === 0x3e ||
      b === 0x26 ||
      b === 0x36 ||
      b === 0x64 ||
      b === 0x65
    ) {
      p++;
      continue;
    }
    if (b >= 0x40 && b <= 0x4f) {
      rex = b;
      p++;
      continue;
    }
    break;
  }

  const w = (rex & 8) !== 0;
  const rexR = (rex & 4) !== 0;
  const rexX = (rex & 2) !== 0;
  const rexB = (rex & 1) !== 0;
  const size: "64" | "32" | "16" = w ? "64" : prefix66 ? "16" : "32";
  const size8 = "8" as const;

  const u32At = (i: number) =>
    (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;

  let lastRegField = 0;

  const readDisp = (mod: number): string => {
    if (mod === 1) {
      const d = bytes[p++] ?? 0;
      return d >= 0x80 ? `-0x${hexPad(256 - d, 2)}` : `+0x${hexPad(d, 2)}`;
    }
    if (mod === 2) {
      const d = u32At(p);
      p += 4;
      return `+0x${hexPad(d, 8)}`;
    }
    return "";
  };

  const readRM = (): string => {
    const modrm = bytes[p++] ?? 0;
    const mod = modrm >> 6;
    const regField = ((modrm >> 3) & 7) + (rexR ? 8 : 0);
    lastRegField = regField;
    const rmLow = modrm & 7;
    if (mod === 3) return x86Reg(rmLow + (rexB ? 8 : 0), size);

    if (rmLow === 4) {
      const sib = bytes[p++] ?? 0;
      const scale = 1 << (sib >> 6);
      const indexLow = (sib >> 3) & 7;
      const baseLow = sib & 7;
      const parts: string[] = [];
      if (indexLow !== 4 || rexX) parts.push(`${X86_R64[indexLow + (rexX ? 8 : 0)]}*${scale}`);
      if (baseLow === 5 && mod === 0) {
        parts.push(`0x${hexPad(u32At(p), 8)}`);
        p += 4;
      } else {
        parts.unshift(X86_R64[baseLow + (rexB ? 8 : 0)]);
      }
      return `[${parts.join("+")}${readDisp(mod)}]`;
    }

    if (rmLow === 5 && mod === 0) {
      const disp = u32At(p);
      p += 4;
      return `[rip+0x${hexPad(disp, 8)}]`;
    }

    return `[${X86_R64[rmLow + (rexB ? 8 : 0)]}${readDisp(mod)}]`;
  };

  const opcode = bytes[p];
  if (opcode === undefined) return { text: ".byte", size: 1 };
  p++;

  const finish = (text: string): X86Instruction => ({
    text,
    size: Math.max(1, Math.min(p - offset, bytes.length - offset)),
  });

  if (prefixF3 && opcode === 0x0f) {
    const b1 = bytes[p];
    const b2 = bytes[p + 1];
    if (b1 === 0x1e && b2 === 0xfa) return { text: "endbr64", size: 4 };
    if (b1 === 0x1e && b2 === 0xfb) return { text: "endbr32", size: 4 };
  }

  if (opcode >= 0x50 && opcode <= 0x57) {
    return finish(`push ${X86_R64[opcode - 0x50 + (rexB ? 8 : 0)]}`);
  }
  if (opcode >= 0x58 && opcode <= 0x5f) {
    return finish(`pop ${X86_R64[opcode - 0x58 + (rexB ? 8 : 0)]}`);
  }
  if (opcode >= 0xb8 && opcode <= 0xbf) {
    const reg = x86Reg(opcode - 0xb8 + (rexB ? 8 : 0), size);
    if (w) {
      let value = 0n;
      for (let i = 0; i < 8; i++) value |= BigInt(bytes[p + i] ?? 0) << BigInt(8 * i);
      p += 8;
      return finish(`mov ${reg}, 0x${value.toString(16)}`);
    }
    const value = u32At(p);
    p += 4;
    return finish(`mov ${reg}, 0x${hexPad(value, 8)}`);
  }
  if (opcode >= 0x70 && opcode <= 0x7f) {
    const disp = ((bytes[p] ?? 0) << 24) >> 24;
    p += 1;
    return finish(`j${X86_CC[opcode - 0x70]} ${hex(p + disp)}`);
  }

  switch (opcode) {
    case 0x90:
      return finish("nop");
    case 0xcc:
      return finish("int3");
    case 0xc3:
      return finish("ret");
    case 0xc9:
      return finish("leave");
    case 0xf4:
      return finish("hlt");
    case 0x98:
      return finish("cwde");
    case 0x99:
      return finish("cdq");
    case 0x60:
      return finish("pushad");
    case 0x68: {
      const value = u32At(p);
      p += 4;
      return finish(`push 0x${hexPad(value, 8)}`);
    }
    case 0x6a: {
      const value = bytes[p++] ?? 0;
      return finish(`push 0x${hexPad(value, 2)}`);
    }
    case 0xe8: {
      const rel = u32At(p) << 0;
      const target = offset + (p - offset) + 4 + (rel | 0);
      p += 4;
      return finish(`call ${hex(target >>> 0)}`);
    }
    case 0xe9: {
      const rel = u32At(p) | 0;
      const target = offset + (p - offset) + 4 + rel;
      p += 4;
      return finish(`jmp ${hex(target >>> 0)}`);
    }
    case 0xeb: {
      const disp = ((bytes[p] ?? 0) << 24) >> 24;
      p += 1;
      return finish(`jmp ${hex(p + disp)}`);
    }
    case 0x88:
    case 0x8a: {
      const rm = readRM();
      const reg = x86Reg(lastRegField, size8);
      return finish(opcode === 0x88 ? `mov ${rm}, ${reg}` : `mov ${reg}, ${rm}`);
    }
    case 0x89:
    case 0x8b: {
      const rm = readRM();
      const reg = x86Reg(lastRegField, size);
      return finish(opcode === 0x89 ? `mov ${rm}, ${reg}` : `mov ${reg}, ${rm}`);
    }
    case 0x8d: {
      const rm = readRM();
      return finish(`lea ${x86Reg(lastRegField, size)}, ${rm}`);
    }
    case 0x01:
    case 0x03: {
      const rm = readRM();
      const reg = x86Reg(lastRegField, size);
      return finish(opcode === 0x01 ? `add ${rm}, ${reg}` : `add ${reg}, ${rm}`);
    }
    case 0x29:
    case 0x2b: {
      const rm = readRM();
      const reg = x86Reg(lastRegField, size);
      return finish(opcode === 0x29 ? `sub ${rm}, ${reg}` : `sub ${reg}, ${rm}`);
    }
    case 0x31:
    case 0x33: {
      const rm = readRM();
      const reg = x86Reg(lastRegField, size);
      return finish(opcode === 0x31 ? `xor ${rm}, ${reg}` : `xor ${reg}, ${rm}`);
    }
    case 0x39:
    case 0x3b: {
      const rm = readRM();
      const reg = x86Reg(lastRegField, size);
      return finish(opcode === 0x39 ? `cmp ${rm}, ${reg}` : `cmp ${reg}, ${rm}`);
    }
    case 0x85:
    case 0x84: {
      const rm = readRM();
      const reg = x86Reg(lastRegField, opcode === 0x84 ? size8 : size);
      return finish(`test ${rm}, ${reg}`);
    }
    case 0xc7: {
      const rm = readRM();
      const value = u32At(p);
      p += 4;
      return finish(`mov ${size === "64" ? "qword " : ""}${rm}, 0x${hexPad(value, 8)}`);
    }
    case 0x83:
    case 0x81: {
      const rm = readRM();
      const sub = lastRegField & 7;
      const imm = opcode === 0x83 ? ((bytes[p++] ?? 0) << 24 >> 24) : (u32At(p) | 0);
      if (opcode === 0x81) p += 4;
      const names = ["add", "or", "adc", "sbb", "and", "sub", "xor", "cmp"];
      const shown = imm < 0 ? `-0x${Math.abs(imm).toString(16)}` : `0x${imm.toString(16)}`;
      return finish(`${names[sub]} ${rm}, ${shown}`);
    }
    case 0xff: {
      const rm = readRM();
      const sub = lastRegField & 7;
      const names = ["inc", "dec", "call", "call", "jmp", "jmp", "push", "invalid"];
      return finish(`${names[sub]} ${rm}`);
    }
    case 0x0f: {
      const b1 = bytes[p++];
      if (b1 !== undefined && b1 >= 0x80 && b1 <= 0x8f) {
        const rel = u32At(p) | 0;
        const target = offset + (p - offset) + 4 + rel;
        p += 4;
        return finish(`j${X86_CC[b1 - 0x80]} ${hex(target >>> 0)}`);
      }
      if (b1 === 0x05) return finish("syscall");
      if (b1 === 0x0b) return finish("ud2");
      if (b1 === 0x1f) {
        readRM();
        return finish("nop");
      }
      if (b1 === 0xb6 || b1 === 0xb7) {
        const rm = readRM();
        const reg = x86Reg(lastRegField, size);
        return finish(`movzx ${reg}, ${rm}`);
      }
      return finish(`db 0x0f, 0x${hexPad(b1 ?? 0, 2)}`);
    }
    default:
      return finish(`db 0x${hexPad(opcode, 2)}`);
  }
}

function disassembleX86(lib: ParsedLib, startOffset: number, count: number): DisasmLine[] {
  const out: DisasmLine[] = [];
  let offset = startOffset;
  for (let i = 0; i < count && offset < lib.bytes.length; i++) {
    const ins = decodeX86(lib.bytes, offset);
    const len = Math.max(1, Math.min(ins.size, lib.bytes.length - offset));
    const shown = Math.min(len, 8);
    const hexBytes: string[] = [];
    for (let b = 0; b < shown; b++) hexBytes.push(hexPad(lib.bytes[offset + b], 2));
    out.push({
      offset,
      vaddr: offsetToVaddr(lib, offset),
      raw: hexBytes.join(" ") + (len > shown ? " …" : ""),
      text: ins.text || `.byte`,
    });
    offset += len;
  }
  return out;
}

export function disassemble(
  lib: ParsedLib,
  startOffset: number,
  count: number,
): DisasmLine[] {
  if (/x86|i[3-6]86|amd64/.test(lib.arch)) return disassembleX86(lib, startOffset, count);
  const out: DisasmLine[] = [];
  const base = offsetToVaddr(lib, startOffset);
  for (let i = 0; i < count; i++) {
    const offset = startOffset + i * 4;
    if (offset + 4 > lib.bytes.length) break;
    const view = new DataView(
      lib.bytes.buffer,
      lib.bytes.byteOffset + offset,
      4,
    );
    const word = view.getUint32(0, true);
    const vaddr = base === null ? null : base + i * 4;
    out.push({
      offset,
      vaddr,
      raw: `${hexPad(word & 0xff, 2)} ${hexPad((word >>> 8) & 0xff, 2)} ${hexPad((word >>> 16) & 0xff, 2)} ${hexPad((word >>> 24) & 0xff, 2)}`,
      text: decodeArm64(word, vaddr ?? 0),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * AOB signature builder
 * ------------------------------------------------------------------ */

export function buildSignature(lib: ParsedLib, offset: number, length: number): string {
  const tokens: string[] = [];
  for (let i = 0; i < length; i += 4) {
    const at = offset + i;
    if (at + 4 > lib.bytes.length) break;
    const view = new DataView(lib.bytes.buffer, lib.bytes.byteOffset + at, 4);
    const word = view.getUint32(0, true);
    const text = decodeArm64(word, 0);
    if (text.startsWith("b ") || text.startsWith("bl ") || text.startsWith("adrp")) {
      tokens.push("?? ?? ?? ??");
    } else {
      tokens.push(
        hexPad(word & 0xff, 2).toUpperCase(),
        hexPad((word >>> 8) & 0xff, 2).toUpperCase(),
        hexPad((word >>> 16) & 0xff, 2).toUpperCase(),
        hexPad((word >>> 24) & 0xff, 2).toUpperCase(),
      );
    }
  }
  return tokens.join(" ");
}

/* ------------------------------------------------------------------ *
 * Exporters
 * ------------------------------------------------------------------ */

export type ExportFormat =
  | "txt"
  | "json"
  | "header"
  | "idc"
  | "aob"
  | "table";

export interface ExportOptions {
  format: ExportFormat;
  userName: string;
  userEmail: string;
  fileName: string;
  includeSections: boolean;
  includeSymbols: boolean;
  includeSegments: boolean;
  labelOverrides: Record<string, string>;
}

export const EXPORT_FORMATS: { id: ExportFormat; label: string; ext: string; mime: string; hint: string }[] = [
  { id: "txt", label: "IDA listing", ext: "txt", mime: "text/plain", hint: "Human-readable segment / section / symbol dump" },
  { id: "json", label: "JSON", ext: "json", mime: "application/json", hint: "Structured dump for your own scripts" },
  { id: "header", label: "C / C++ header", ext: "h", mime: "text/plain", hint: "#define offsets + symbol table" },
  { id: "idc", label: "IDA script (.idc)", ext: "idc", mime: "text/plain", hint: "Auto-rename + comment every symbol in IDA" },
  { id: "aob", label: "AOB signatures", ext: "aob", mime: "text/plain", hint: "Byte signatures per function for memory scanners" },
  { id: "table", label: "Offset table", ext: "csv", mime: "text/csv", hint: "name,address,offset,size — spreadsheet friendly" },
];

/**
 * Branded "drop alert" header placed at the very top of every dump, in the
 * style of a Hex-Rays generated listing but stamped with our own branding.
 */
function dropAlert(
  lib: ParsedLib,
  opts: {
    userName: string;
    userEmail: string;
    fileName: string;
    outputName: string;
    extra?: string[];
  },
): string[] {
  const bits = `${lib.bits}-bit`;
  const exporter = `${opts.userName || "anonymous"}${opts.userEmail ? ` <${opts.userEmail}>` : ""}`;
  return [
    `This file was generated by ${TOOL_NAME}.`,
    `Copyright (c) ${new Date().getFullYear()} ${OWNER_NAME} <${TELEGRAM_CHANNEL}>`,
    `Detected target: ${lib.format} · ${lib.arch} · ${bits} · ${lib.endian} endian`,
    "",
    "🌟 LUCKY HUB Drop Alert! 🚀💻",
    "🔥 Advanced Libs & C Files !",
    `🔍 LIB Name: ${opts.fileName}`,
    `ℹ️ Arch: ${lib.arch} (${bits}) | 📦 Format: ${lib.format}`,
    `🛠 Tool: ${TOOL_NAME}`,
    `📍 File: ${opts.outputName}`,
    "💡 Shoutout to the LUCKY HUB community!",
    `👤 Owner: ${OWNER_NAME} · ${TELEGRAM_CHANNEL}`,
    `🧩 Symbols: ${lib.symbols.length} | Sections: ${lib.sections.length} | Segments: ${lib.segments.length}`,
    `🎯 Entry: ${hex(lib.entry)} | 🏠 Image base: ${hex(lib.imageBase)}`,
    `🧑‍💻 Exported by: ${exporter}`,
    `🕒 Generated: ${new Date().toISOString()}`,
    "🔒 100% offline — nothing was uploaded",
    ...(opts.extra ?? []),
    "⏳ Stay tuned for more drops! ✨",
  ];
}

/** Wraps banner lines in a single C-style comment block, escaping nested end markers. */
function cComment(lines: string[]): string[] {
  return ["/*", ...lines.map((l) => l.replace(/\*\//g, "* /")), "*/"];
}

/** Enriched options carrying the parsed lib and the resolved output file name. */
type ExportContext = ExportOptions & { lib: ParsedLib; outputName: string };

/** Plain-text drop-alert header used by the flat (non-C) exports. */
function banner(opts: ExportContext): string[] {
  return [...dropAlert(opts.lib, opts), ""];
}

export function exportDump(lib: ParsedLib, inputOpts: ExportOptions): { fileName: string; content: string; mime: string } {
  const slug = inputOpts.fileName.replace(/[^\w.-]+/g, "_").slice(0, 60) || "lib";
  const spec = EXPORT_FORMATS.find((f) => f.id === inputOpts.format)!;
  const baseName = `${slug}.luckyhub.${spec.ext}`;
  const opts: ExportContext = { ...inputOpts, lib, outputName: baseName };
  const nameOf = (s: LibSymbol) => opts.labelOverrides[s.name] ?? s.name;

  if (opts.format === "json") {
    const payload = {
      tool: TOOL_NAME,
      owner: OWNER_NAME,
      telegram: TELEGRAM_CHANNEL,
      dropAlert: dropAlert(lib, { ...opts, outputName: baseName }),
      exportedBy: { name: opts.userName, email: opts.userEmail },
      generatedAt: new Date().toISOString(),
      library: {
        file: opts.fileName,
        format: lib.format,
        arch: lib.arch,
        bits: lib.bits,
        endian: lib.endian,
        entry: hex(lib.entry),
        imageBase: hex(lib.imageBase),
        size: lib.bytes.length,
        header: lib.fields,
      },
      segments: opts.includeSegments ? lib.segments : undefined,
      sections: opts.includeSections
        ? lib.sections.map((s) => ({ ...s, addr: hex(s.addr), offset: hex(s.offset), size: hex(s.size) }))
        : undefined,
      symbols: opts.includeSymbols
        ? lib.symbols.map((s) => ({
            name: nameOf(s),
            address: hex(s.value),
            fileOffset: hex(s.offset),
            size: hex(s.size),
            kind: s.kind,
            bind: s.bind,
            section: s.section,
          }))
        : undefined,
      counts: {
        segments: lib.segments.length,
        sections: lib.sections.length,
        symbols: lib.symbols.length,
        imports: lib.imports.length,
        exports: lib.exports.length,
      },
    };
    return { fileName: baseName, content: JSON.stringify(payload, null, 2), mime: spec.mime };
  }

  if (opts.format === "header") {
    const lines: string[] = [];
    lines.push(...cComment(dropAlert(lib, { ...opts, outputName: baseName })));
    lines.push(`#pragma once`);
    lines.push(`#define LUCKYHUB_ARCH "${lib.arch}"`);
    lines.push(`#define LUCKYHUB_BITS ${lib.bits}`);
    lines.push(`#define LUCKYHUB_IMAGE_BASE ${hex(lib.imageBase)}ULL`);
    lines.push(`#define LUCKYHUB_ENTRY ${hex(lib.entry)}ULL`);
    lines.push("");
    if (opts.includeSections) {
      lines.push("/* ---- sections ---- */");
      for (const s of lib.sections) {
        lines.push(`#define ${cIdent(`SEC_${s.name}`)} ${hex(s.addr)}ULL /* file ${hex(s.offset)} size ${hex(s.size)} */`);
      }
      lines.push("");
    }
    if (opts.includeSymbols) {
      lines.push("/* ---- symbols ---- */");
      for (const s of lib.symbols) {
        lines.push(`#define ${cIdent(nameOf(s))} ${hex(s.value)}ULL`);
      }
      lines.push("");
      lines.push("static const LuckyHubSymbol kLuckyHubSymbols[] = {");
      for (const s of lib.symbols) {
        lines.push(`    { ${hex(s.value)}ULL, ${hex(s.offset)}, "${escapeStr(nameOf(s))}" },`);
      }
      lines.push("};");
    }
    return { fileName: baseName, content: lines.join("\n"), mime: spec.mime };
  }

  if (opts.format === "idc") {
    const lines: string[] = [];
    lines.push(...cComment(dropAlert(lib, { ...opts, outputName: baseName })));
    lines.push("#include <idc.idc>");
    lines.push("");
    lines.push("static LuckyHub_Tag(ea, tag) {");
    lines.push('  MakeComm(ea, sprintf("[%s] %s", tag, get_cmt(ea, 0)));');
    lines.push("}");
    lines.push("");
    lines.push("static main() {");
    lines.push(`  Message("${TOOL_NAME} — ${OWNER_NAME} — ${TELEGRAM_CHANNEL}\\n");`);
    lines.push(`  // ${lib.arch} ${lib.bits}-bit ${lib.format}`);
    for (const s of lib.symbols) {
      if (s.value === 0) continue;
      const nm = cIdent(nameOf(s));
      lines.push(`  MakeName(${hex(s.value)}, "${escapeStr(nm)}");`);
      lines.push(`  MakeComm(${hex(s.value)}, "${TOOL_NAME} · offset ${hex(s.offset)} · ${escapeStr(s.section)}");`);
    }
    lines.push("  Message(\"LUCKY HUB: symbols renamed and annotated.\\n\");");
    lines.push("}");
    lines.push("");
    lines.push("main();");
    return { fileName: baseName, content: lines.join("\n"), mime: spec.mime };
  }

  if (opts.format === "aob") {
    const lines: string[] = [];
    for (const l of banner({ ...opts })) lines.push(`// ${l}`);
    const funcs = lib.symbols.filter((s) => s.kind === "FUNC" && s.offset > 0);
    const source = funcs.length > 0 ? funcs : lib.symbols.filter((s) => s.offset > 0);
    for (const s of source.slice(0, 4000)) {
      const sig = buildSignature(lib, s.offset, 32);
      if (!sig) continue;
      lines.push(
        `${sig}  // ${nameOf(s)} | vaddr ${hex(s.value)} | file ${hex(s.offset)} | ${lib.arch}`,
      );
    }
    if (source.length === 0) {
      lines.push("// No symbol table found — generate signatures from the Signatures tab instead.");
    }
    return { fileName: baseName, content: lines.join("\n"), mime: spec.mime };
  }

  if (opts.format === "table") {
    const lines: string[] = [`name,address,file_offset,size,kind,bind,section`];
    for (const s of lib.symbols) {
      lines.push(
        [nameOf(s), hex(s.value), hex(s.offset), hex(s.size), s.kind, s.bind, s.section]
          .map((v) => `"${v}"`)
          .join(","),
      );
    }
    return { fileName: baseName, content: lines.join("\n"), mime: spec.mime };
  }

  // txt — IDA listing style
  const lines: string[] = [];
  for (const l of banner({ ...opts })) lines.push(l.replace(/=/g, "="));
  lines.push(`format      : ${lib.format}`);
  lines.push(`arch        : ${lib.arch} (${lib.bits}-bit, ${lib.endian} endian)`);
  lines.push(`image base  : ${hex(lib.imageBase)}`);
  lines.push(`entry point : ${hex(lib.entry)}`);
  lines.push(`file size   : ${lib.bytes.length} bytes`);
  lines.push("");
  for (const f of lib.fields) lines.push(`  ${f.key.padEnd(22)} ${f.value}`);
  lines.push("");

  if (opts.includeSegments && lib.segments.length) {
    lines.push("/* ===== SEGMENTS ===== */");
    lines.push("  idx  name                 vaddr         fileoff       filesize   prot");
    for (const s of lib.segments) {
      lines.push(
        `  ${String(s.index).padStart(3)}  ${s.name.slice(0, 20).padEnd(20)} ${hex(s.vmaddr).padEnd(13)} ${hex(s.fileoff).padEnd(13)} ${hex(s.filesize).padEnd(10)} ${s.flag}`,
      );
    }
    lines.push("");
  }

  if (opts.includeSections && lib.sections.length) {
    lines.push("/* ===== SECTIONS ===== */");
    lines.push("  idx  name                 kind      vaddr         fileoff       size");
    for (const s of lib.sections) {
      lines.push(
        `  ${String(s.index).padStart(3)}  ${s.name.slice(0, 20).padEnd(20)} ${s.kind.padEnd(9)} ${hex(s.addr).padEnd(13)} ${hex(s.offset).padEnd(13)} ${hex(s.size)}`,
      );
    }
    lines.push("");
  }

  if (opts.includeSymbols && lib.symbols.length) {
    lines.push("/* ===== SYMBOLS ===== */");
    lines.push("  #      address       fileoffset    size     bind    kind    name");
    lib.symbols.forEach((s, i) => {
      lines.push(
        `  ${String(i).padStart(5)}  ${hex(s.value).padEnd(13)} ${hex(s.offset).padEnd(13)} ${hex(s.size).padEnd(8)} ${s.bind.padEnd(7)} ${s.kind.padEnd(7)} ${nameOf(s)}`,
      );
    });
    lines.push("");
  }

  lines.push(`/* ${TOOL_NAME} — made by ${OWNER_NAME} — ${TELEGRAM_CHANNEL} */`);
  return { fileName: baseName, content: lines.join("\n"), mime: spec.mime };
}

function cIdent(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "");
  if (!cleaned) return "SYM_UNKNOWN";
  return /^[0-9]/.test(cleaned) ? `S_${cleaned}` : cleaned.toUpperCase();
}

function escapeStr(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/* ------------------------------------------------------------------ *
 * Download helper
 * ------------------------------------------------------------------ */

export function triggerDownload(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function bytesToHexDumpPreview(bytes: Uint8Array, max = 512): string {
  const out: string[] = [];
  for (let i = 0; i < Math.min(bytes.length, max); i += 16) {
    const chunk = Array.from(bytes.subarray(i, i + 16));
    out.push(`${hexPad(i, 8)}  ${chunk.map((b) => hexPad(b, 2)).join(" ")}`);
  }
  return out.join("\n");
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  return `${(size / 1024 ** i).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
