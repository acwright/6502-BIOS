#!/usr/bin/env node
//
// The storage fixtures: a CompactFlash image with a known directory, and the
// `.prg` that lives on it.
//
// Generated rather than checked in, because a multi-megabyte binary cannot be
// reviewed in a diff and this file can. Everything a case needs to assert against — the
// bytes of each file, its size, the sector it starts at — comes back in the
// manifest, so a test never repeats a number that is written here.
//
//   node tests/fixtures/build.mjs        write the fixtures and describe them
//
// The runner calls buildFixtures() itself before it launches the `cf` profile,
// so the fixtures are never stale and never have to be built by hand.
//
// The card's layout is the BIOS's, from Kernal.asm's "Simple Custom Filesystem"
// and BIOS.inc: 256 disk banks of 2048 sectors, each with a 512-byte directory
// of sixteen 32-byte entries at its first sector, data sectors following.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export const SECTOR_SIZE = 512
export const DISK_SECTORS = 2048 // one 1 MB disk bank
export const ENTRY_SIZE = 32
export const MAX_FILES = 16
export const DATA_START = 1 // sector 0 is the directory

// Entry offsets, from Kernal.asm's format comment.
const ENTRY_FLAGS = 11
const ENTRY_START = 12
const ENTRY_FSIZE = 14
const FLAG_USED = 0x01

// How many banks the image covers. Four, because that is what the cases need:
// disk 0 carries the files, disk 1 proves a bank is a separate namespace,
// disk 2 is deliberately full to its last sector, and disk 3 is the bank a
// file spilling out of disk 2 would land on — it has to be a real bank with
// something on it, or "did not spill" is unobservable.
export const IMAGE_DISKS = 4

const PROGRAM_START = 0x0800
const CHROUT = 0xa000

const TOK_PRINT = 0x96
const TOK_SYS = 0xa5

// ---------------------------------------------------------------------------
// Program images
//
// A program file is exactly what sits at $0800: msbasic's chain of
// [link][line number][tokens][$00], ending in a $0000 link. Nothing tokenises
// here beyond the one keyword each fixture needs — a fixture that had to
// reproduce the crunch table would be a second implementation of it, and the
// cases assert what these programs *do*, never how they were tokenised.

function programImage(lines, { trailer = [] } = {}) {
  const body = []
  const starts = []
  // Two passes: the link field of each line holds the address of the next, and
  // that is not known until every line has been laid out.
  let address = PROGRAM_START
  for (const line of lines) {
    starts.push(address)
    address += 4 + line.bytes.length + 1
  }
  const end = address + 2 // the $0000 link that ends the chain

  lines.forEach((line, i) => {
    const next = i + 1 < starts.length ? starts[i + 1] : address
    body.push(next & 0xff, next >> 8, line.number & 0xff, line.number >> 8, ...line.bytes, 0x00)
  })
  body.push(0x00, 0x00)

  return { bytes: Uint8Array.from([...body, ...trailer]), codeStart: end }
}

function print(text) {
  return [TOK_PRINT, 0x22, ...ascii(text), 0x22]
}

function ascii(text) {
  return [...text].map((c) => c.charCodeAt(0))
}

// A `.prg`: one `10 SYS nnnn` line with machine code attached behind it. The
// SYS argument has to name the address the code lands at, which is decided by
// the length of the line naming it — so it is laid out once with a placeholder,
// then again with the address that came out. 2060 ($080C) is what a four-digit
// argument gives, and is the number the README uses.
function prgImage(code) {
  const first = programImage([{ number: 10, bytes: [TOK_SYS, ...ascii('0000')] }])
  const target = first.codeStart
  const digits = String(target)
  if (digits.length !== 4) {
    throw new Error(`the SYS argument has to stay four digits wide, got ${digits}`)
  }
  const image = programImage([{ number: 10, bytes: [TOK_SYS, ...ascii(digits)] }], {
    trailer: code(target),
  })
  return { bytes: image.bytes, sysAddress: target, codeStart: image.codeStart }
}

// Print a marker and return. Hand-assembled: six instructions is cheaper than
// depending on cc65 to build a fixture, and every byte of it is asserted by
// `a-prg-survives-loading-and-a-variable.mjs`, which is the point of it.
function markerCode(base) {
  const message = [...ascii('PRG OK'), 0x0d, 0x0a, 0x00]
  const loop = base + 2
  const done = base + 13
  const text = base + 14
  const bytes = [
    0xa2, 0x00, // LDX #$00
    0xbd, text & 0xff, text >> 8, // LDA text,X
    0xf0, done - (base + 7), // BEQ done
    0x20, CHROUT & 0xff, CHROUT >> 8, // JSR Chrout
    0xe8, // INX
    0xd0, (loop - (base + 13)) & 0xff, // BNE loop
    0x60, // RTS
    ...message,
  ]
  return bytes
}

// ---------------------------------------------------------------------------
// The card

const HELLO = programImage([{ number: 10, bytes: print('HELLO FROM DISK 0') }]).bytes
const OTHER = programImage([{ number: 10, bytes: print('HELLO FROM DISK 1') }]).bytes
const SAMPLE = prgImage(markerCode)

// 300 bytes, deliberately not a sector multiple: a load rounds up to the sector
// and a case has to know that the bytes past the file's own length are the
// card's, not the file's.
const RAW = Uint8Array.from({ length: 300 }, (_, i) => (i * 7 + 0x21) & 0xff)

// Eight sectors ending exactly on the disk's last one, so the next free sector
// is 2048 and nothing more will fit. This is what makes "a file cannot spill
// into the next disk" testable: the guard is on the *end* sector, which no
// single file small enough to save could otherwise reach.
const TAIL = new Uint8Array(8 * SECTOR_SIZE).fill(0xa5)

const LAYOUT = [
  {
    disk: 0,
    files: [
      { name: 'HELLO', ext: 'BAS', bytes: HELLO, what: 'a program that prints its disk' },
      { name: 'SAMPLE', ext: 'PRG', bytes: SAMPLE.bytes, what: 'a .prg: 10 SYS 2060 and its machine code' },
      { name: 'RAW', ext: 'BIN', bytes: RAW, what: '300 known bytes, for BLOAD' },
    ],
  },
  {
    disk: 1,
    files: [{ name: 'OTHER', ext: 'BAS', bytes: OTHER, what: 'the same job on another bank' }],
  },
  {
    disk: 2,
    files: [
      { name: 'KEEP', ext: 'BIN', bytes: Uint8Array.of(0x11, 0x22, 0x33, 0x44), what: 'proof the directory survived a failed save' },
      { name: 'TAIL', ext: 'BIN', bytes: TAIL, startSector: DISK_SECTORS - 8, what: 'claims the end of the disk, leaving no room' },
    ],
  },
  {
    disk: 3,
    files: [{ name: 'NEXTDISK', ext: 'BIN', bytes: Uint8Array.of(0x55, 0xaa), what: 'what a spill out of disk 2 would land on' }],
  },
]

// ---------------------------------------------------------------------------

// What is on the card, without touching the disk. A probe wants the bytes and
// the sizes, not the file — describing and writing are separate so a case can
// assert against the fixture without rewriting an image the emulator has open.
export function describeFixtures({ dir = HERE } = {}) {
  const image = new Uint8Array(IMAGE_DISKS * DISK_SECTORS * SECTOR_SIZE)
  const files = []

  for (const { disk, files: specs } of LAYOUT) {
    if (disk >= IMAGE_DISKS) throw new Error(`disk ${disk} is past the end of a ${IMAGE_DISKS}-disk image`)
    if (specs.length > MAX_FILES) throw new Error(`disk ${disk} has more than ${MAX_FILES} files`)

    const base = disk * DISK_SECTORS * SECTOR_SIZE
    // FsCalcNextSec's rule, and the only one the ROM knows: the next free
    // sector is the highest end sector any entry claims. A fixture laid out any
    // other way would be a card the BIOS could not have written.
    let cursor = DATA_START

    specs.forEach((spec, index) => {
      const sectors = Math.ceil(spec.bytes.length / SECTOR_SIZE)
      const startSector = spec.startSector ?? cursor
      cursor = Math.max(cursor, startSector + sectors)
      if (cursor > DISK_SECTORS) {
        throw new Error(`${spec.name}.${spec.ext} runs past the end of disk ${disk}`)
      }

      writeEntry(image, base + index * ENTRY_SIZE, spec, startSector)
      image.set(spec.bytes, base + startSector * SECTOR_SIZE)
      files.push({
        disk,
        name: spec.name,
        ext: spec.ext,
        filename: `${spec.name}.${spec.ext}`,
        bytes: spec.bytes,
        size: spec.bytes.length,
        startSector,
        entry: index,
        what: spec.what,
      })
    })
  }

  return {
    image,
    imagePath: join(dir, 'test.img'),
    prgPath: join(dir, 'sample.prg'),
    files,
    disks: IMAGE_DISKS,
    prg: { ...SAMPLE, path: join(dir, 'sample.prg') },
    file: (filename) => {
      const found = files.find((f) => f.filename === filename)
      if (!found) throw new Error(`no fixture file named ${filename}`)
      return found
    },
  }
}

export function buildFixtures({ dir = HERE } = {}) {
  const manifest = describeFixtures({ dir })
  mkdirSync(dir, { recursive: true })
  writeFileSync(manifest.imagePath, manifest.image)
  writeFileSync(manifest.prgPath, manifest.prg.bytes)
  return manifest
}

function writeEntry(image, at, spec, startSector) {
  const name = pad(spec.name, 8)
  const ext = pad(spec.ext, 3)
  image.set(Uint8Array.from(ascii(name + ext)), at)
  image[at + ENTRY_FLAGS] = FLAG_USED
  image[at + ENTRY_START] = startSector & 0xff
  image[at + ENTRY_START + 1] = startSector >> 8
  image[at + ENTRY_FSIZE] = spec.bytes.length & 0xff
  image[at + ENTRY_FSIZE + 1] = spec.bytes.length >> 8
}

// The BIOS matches a name by comparing all eleven bytes, so a fixture entry has
// to be padded exactly as FsParseName pads what a user types.
function pad(text, width) {
  if (text.length > width) throw new Error(`${JSON.stringify(text)} is wider than ${width}`)
  return text.padEnd(width, ' ')
}

// The directory listing a case should expect: FsDirectory prints the 8-byte
// name, a dot, the 3-byte extension, a space, and the size in decimal.
export function dirLine({ name, ext, size }) {
  return `${pad(name, 8)}.${pad(ext, 3)} ${size}`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = buildFixtures()
  console.log(`${manifest.imagePath}  ${manifest.disks} disks`)
  for (const f of manifest.files) {
    console.log(
      `  disk ${f.disk}  ${dirLine(f).padEnd(20)} sector ${f.startSector}  ${f.what}`,
    )
  }
  console.log(`${manifest.prgPath}  SYS ${manifest.prg.sysAddress}, code at $${manifest.prg.codeStart.toString(16)}`)
}
