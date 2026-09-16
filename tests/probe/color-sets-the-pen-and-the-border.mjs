// README § Video & Display: "`COLOR <fg>[, <bg>[, <border>]]`", and the
// `VideoSetColor` slot ($A027): "`A`=`(fg<<4)|bg`".
//
// On a PICOVDP console the colour is a property of each cell, not of the screen:
// `COLOR` sets the pen, the pen is written into the attribute table beside every
// character printed afterwards, and register 7 — the border — follows the
// background (VDP-PLAN decision 8). So the evidence is in two places, and both
// are read back through the debugger rather than caught on the bus: the
// attribute byte in VRAM at `$0400` past the character's name byte, and
// register 7 from `video.registers`.
//
// The character is found by searching the name table for it, which is why it is
// printed as `CHR$(64)`: an `@` typed literally would also be on screen in the
// echo of the line, in the colour the line was typed in.

import { run as runLine } from '../lib/video.mjs'
import { findCell, vram, NAME_TABLE_SIZE, ATTRIBUTES } from '../lib/cells.mjs'

export const name = 'COLOR sets the pen for the cells printed next, and the border'
export const profile = 'video'

const VideoSetColor = 0xa027
const VID_PEN = 0x0391
const COLOR_REGISTER = 7
const AT = 0x40

async function printedIn(m, statement) {
  await runLine(
    m,
    `CLS : ${statement} : PRINT CHR$(${AT});`,
    (lines) => lines.some((line) => line.includes('@') && !line.includes('CHR$')),
    `after ${JSON.stringify(statement)}`,
  )
  const names = await vram(m, 0, NAME_TABLE_SIZE)
  const cell = findCell(m, names, AT, statement)
  const attributes = await vram(m, ATTRIBUTES, NAME_TABLE_SIZE)
  const registers = await m.videoRegisters()
  return { attribute: attributes[cell], border: registers[COLOR_REGISTER] }
}

export async function run(m) {
  // Both nibbles, both ends of each, and pairs that are not symmetric — a
  // swapped fg/bg reads correctly whenever the two happen to be equal.
  for (const [fg, bg] of [[1, 0], [15, 0], [0, 15], [7, 4]]) {
    const { attribute, border } = await printedIn(m, `COLOR ${fg},${bg}`)
    m.assertByte(attribute, (fg << 4) | bg, `COLOR ${fg},${bg} — the attribute of the next cell`)
    m.assertByte(border, (fg << 4) | bg, `COLOR ${fg},${bg} — register 7`)
  }

  // The pin for eed5f37: the foreground was parked in zero page while the
  // background was evaluated, and PEEK's own argument runs through the routine
  // that uses it. Literals never went near it.
  const peeked = await printedIn(m, 'POKE 4096,4 : COLOR 7, PEEK(4096)')
  m.assertByte(peeked.attribute, 0x74, 'COLOR 7, PEEK(4096) — the foreground has to survive the second argument')

  // And the slot, which takes the byte already packed.
  await m.call6502(VideoSetColor, { A: 0x3d })
  m.assertByte(await m.peek(VID_PEN), 0x3d, 'VideoSetColor sets VID_PEN to A')
  m.assertByte((await m.videoRegisters())[COLOR_REGISTER], 0x3d, 'VideoSetColor writes A to register 7')
}
