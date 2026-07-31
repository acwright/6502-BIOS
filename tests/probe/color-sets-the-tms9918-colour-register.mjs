// README § Video & Display: "`COLOR <fg>, <bg>` — Set TMS9918 text
// foreground/background colours (0–15 each)", and the `VideoSetColor` slot
// ($A027): "`A`=`(fg<<4)|bg`".
//
// Asserted at the chip, not on the screen. `screen.text` decodes the name table
// and knows nothing about colour, and the TMS9918's register file is write-only
// on the real part — so what went out on the bus is not merely the most direct
// evidence, it is the only evidence.
//
// The video card's register protocol is two writes to the same address: the
// data byte, then the register number with bit 7 set. That makes $87 — register
// 7, the text colour — the marker to look for, and it is unambiguous: the only
// other traffic to this address is the VRAM address latch, whose high byte
// carries bit 6 and never bit 7.
//
// **Why the statement is run from a program gated on WAIT rather than typed.**
// On this machine the console *is* the screen, so echoing a keystroke latches a
// VRAM address, which is a write to the very register being watched. Typing the
// command under the watchpoint stops the machine on the echo of its first
// character — with the key delivery still in flight, which wedges it. So the
// line is typed with nothing armed, `RUN` leaves it spinning on a `WAIT`
// against a byte of free RAM, and only then is the watchpoint set and the byte
// poked. The statement runs with the machine already going and the screen
// quiet, which is the only window on this profile where the bus carries nothing
// but what is under test.

import { recordWrites } from '../lib/writes.mjs'
import { typeLine, awaitScreen } from '../lib/video.mjs'

export const name = 'COLOR writes the foreground and background to TMS9918 register 7'
export const profile = 'video'

const VC_REG = 0x9c01
const REGISTER_7 = 0x87

const VideoSetColor = 0xa027

// Free RAM: above anything a two-line program reaches, below the string heap
// that grows down from $8000, and clear of call6502's stub at $7F00.
const GATE = 0x7e00

// The register-7 write is the byte immediately before the $87, so find the $87
// and step back one.
function colourFrom(m, writes, what) {
  const at = writes.findIndex((w) => w.value === REGISTER_7)
  m.assert(at > 0, `${what}: no write to TMS9918 register 7 went out on the bus`)
  return writes[at - 1].value
}

async function colourAfter(m, statement) {
  await m.write(GATE, 0)
  await typeLine(m, `10 WAIT ${GATE},1 : ${statement}`)
  await awaitScreen(m, () => true, `accepted ${JSON.stringify(statement)}`)

  await typeLine(m, 'RUN')
  await awaitScreen(m, (lines) => lines.some((l) => l.includes('RUN')), 'started the program')

  const writes = await recordWrites(m, {
    start: VC_REG,
    max: 8,
    until: (w) => w.some((x) => x.value === REGISTER_7),
    body: async () => {
      await m.write(GATE, 1) // release the WAIT
      await m.start()
    },
  })
  return colourFrom(m, writes, statement)
}

export async function run(m) {
  // Both nibbles, both ends of each, and pairs that are not symmetric — a
  // swapped fg/bg reads correctly whenever the two happen to be equal, which is
  // most of the obvious things to try.
  for (const [fg, bg] of [[1, 0], [15, 0], [0, 15], [7, 4]]) {
    m.assertByte(
      await colourAfter(m, `COLOR ${fg},${bg}`),
      (fg << 4) | bg,
      `COLOR ${fg},${bg} — the byte written to register 7`,
    )
  }

  // And the slot, which takes the byte already packed. Same register, same
  // protocol, no arithmetic of its own to get wrong — and no typing, so it can
  // be called directly with the watchpoint armed.
  const writes = await recordWrites(m, {
    start: VC_REG,
    max: 8,
    until: (w) => w.some((x) => x.value === REGISTER_7),
    body: async () => {
      await m.plantCall(VideoSetColor, { A: 0x3d })
      await m.start()
    },
  })
  m.assertByte(colourFrom(m, writes, 'VideoSetColor'), 0x3d, 'VideoSetColor passes A through')
}
