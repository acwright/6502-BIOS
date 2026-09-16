// VDP-PLAN §4.3: `CLS` fills all 960 attributes with the pen, so that
// `COLOR 1,15:CLS` gives a whole screen of that colour, as it did on 1.x.
//
// Without it a per-cell console would clear to blanks in whatever colours the
// cells last had, and a coloured background would only ever reach the cells
// something had been printed in.

import { run as runLine } from '../lib/video.mjs'
import { vram, NAME_TABLE_SIZE, ATTRIBUTES } from '../lib/cells.mjs'

export const name = 'CLS fills every cell with the pen'
export const profile = 'video'

const VideoClear = 0xa018

export async function run(m) {
  await runLine(
    m,
    'COLOR 5,10 : CLS : PRINT CHR$(64);',
    (lines) => lines.some((line) => line.startsWith('@')),
    'cleared in the new pen',
  )
  const attributes = await vram(m, ATTRIBUTES, NAME_TABLE_SIZE)
  const wrong = attributes.findIndex((byte) => byte !== 0x5a)
  m.assert(
    wrong < 0,
    `cell ${wrong} holds attribute $${attributes[wrong]?.toString(16)} after COLOR 5,10 : CLS, not $5A`,
  )

  // And the slot, with a pen set directly: every name a space, every attribute
  // the pen.
  await m.call6502(0xa027, { A: 0xe4 }) // VideoSetColor
  await m.call6502(VideoClear)
  const names = await vram(m, 0, NAME_TABLE_SIZE)
  m.assert(names.every((byte) => byte === 0x20), 'VideoClear left a name byte that is not a space')
  const after = await vram(m, ATTRIBUTES, NAME_TABLE_SIZE)
  m.assert(after.every((byte) => byte === 0xe4), 'VideoClear left an attribute that is not the pen')
}
