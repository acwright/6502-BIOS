// VDP-PLAN §4.3: `VideoScroll` moves the display origin down a row and blanks
// the row that left the top. The other 920 bytes of the name table stay where
// they are.
//
// That is what makes a scroll cost about 500 cycles instead of 31,000, and it is
// invisible on screen — a copying scroll looks identical. So it is asserted in
// VRAM: a table full of distinct bytes, one scroll, and every byte but one row's
// still in its place, that row blank in the pen, and `L0SCRY` one row further.
// And then across the wrap, where the origin comes back to row 0.

import { vram, NAME_TABLE_SIZE, ATTRIBUTES, VID_TOP, REG_L0SCRY } from '../lib/cells.mjs'

export const name = 'a scroll moves the display origin, not the name table'
export const profile = 'video'

const VideoClear = 0xa018
const VideoScroll = 0xa024
const VideoSetColor = 0xa027
const COLUMNS = 40
const ROWS = 24

const pattern = Array.from({ length: NAME_TABLE_SIZE }, (_, i) => 0x21 + (i % 90))

async function scrollOnce(m, top) {
  await m.write(0, pattern, 'vram')
  await m.write(ATTRIBUTES, Array(NAME_TABLE_SIZE).fill(0x3c), 'vram')
  await m.call6502(VideoScroll)

  const next = (top + 1) % ROWS
  m.assertEqual(await m.peek(VID_TOP), next, `VID_TOP after a scroll from row ${top}`)
  m.assertEqual((await m.videoRegisters())[REG_L0SCRY], next * 8, `L0SCRY after a scroll from row ${top}`)

  const names = await vram(m, 0, NAME_TABLE_SIZE)
  const attributes = await vram(m, ATTRIBUTES, NAME_TABLE_SIZE)
  for (let i = 0; i < NAME_TABLE_SIZE; i++) {
    const cleared = Math.floor(i / COLUMNS) === top
    const [name, attribute] = cleared ? [0x20, 0x71] : [pattern[i], 0x3c]
    if (names[i] !== name || attributes[i] !== attribute) {
      m.fail(
        `after a scroll from row ${top}, cell ${i} (row ${Math.floor(i / COLUMNS)}) holds ` +
          `$${names[i].toString(16)}/$${attributes[i].toString(16)}, expected ` +
          `$${name.toString(16)}/$${attribute.toString(16)}` +
          (cleared ? ' — the row that left the top is blanked in the pen' : ' — it should not have moved'),
      )
    }
  }
}

export async function run(m) {
  await m.call6502(VideoSetColor, { A: 0x71 })
  await m.call6502(VideoClear)
  m.assertEqual(await m.peek(VID_TOP), 0, 'VID_TOP after VideoClear')

  await scrollOnce(m, 0)

  // Across the wrap: from the last row the origin comes back to 0.
  await m.write(VID_TOP, ROWS - 1)
  await scrollOnce(m, ROWS - 1)

  // And CLS takes the origin home.
  await m.call6502(VideoClear)
  m.assertEqual(await m.peek(VID_TOP), 0, 'VID_TOP after VideoClear on a scrolled screen')
  m.assertEqual((await m.videoRegisters())[REG_L0SCRY], 0, 'L0SCRY after VideoClear on a scrolled screen')
}
