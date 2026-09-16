// VDP-PLAN decision 11, the other half: after `KernalInit` the card is in the
// legacy submode, and the first thing printed brings the Text console up —
// `InitVideo` and a clear — so BASIC's header, EhBASIC and vc83basic get a
// console without calling anything first.
//
// Three things, each of which a half-done bring-up would miss: the card is in
// Text mode (`VMODE` 1), the font is in the pattern table (poisoned first, since
// the card's own reset already put one there), and the character is on the
// screen at the top left of a cleared screen.

import { vram, VID_MODE } from '../lib/cells.mjs'

export const name = 'the Text console comes up on the first Chrout after KernalInit'
export const profile = 'video'

const KernalInit = 0xa078
const Chrout = 0xa000

const PATTERN_TABLE = 0x0800
const CHARSET_IN_ROM_IMAGE = 0xb800 - 0x8000
const CHARSET_SIZE = 0x0800

export async function run(m) {
  await m.call6502(KernalInit)
  m.assertEqual((await m.videoInfo()).mode.vmode, 0, 'VMODE after KernalInit')

  await m.fillMem(PATTERN_TABLE, CHARSET_SIZE, 0x5a, 'vram')
  await m.call6502(Chrout, { A: 0x58 }) // X

  const { mode } = await m.videoInfo()
  m.assertEqual(mode.vmode, 1, 'VMODE after the first Chrout')
  m.assertEqual(mode.geometry, 'text', 'the geometry after the first Chrout')
  m.assertByte(await m.peek(VID_MODE), 1, 'VID_MODE after the first Chrout')

  m.assertBytes(
    await vram(m, PATTERN_TABLE, CHARSET_SIZE),
    await m.read(CHARSET_IN_ROM_IMAGE, CHARSET_SIZE, 'rom'),
    'the pattern table after the first Chrout',
  )

  const lines = await m.screenText()
  m.assertEqual(lines[0], 'X'.padEnd(40), 'the top row: the character, on a cleared screen')
  m.assert(lines.slice(1).every((line) => line.trim() === ''), 'the rest of the screen was not cleared')

  // And a second call does not bring it up again: the X stays.
  await m.call6502(Chrout, { A: 0x59 }) // Y
  m.assertEqual((await m.screenText())[0], 'XY'.padEnd(40), 'the top row after a second Chrout')
}
