// VDP-PLAN decision 6: on a video console the header starts with a "6502"
// wordmark in half-block characters, four rows, each row a band of its own
// colour from palette row 0 — dark red, medium red, dark yellow, medium green —
// on the pen's background, centred, with a blank line under it. The pen is
// the default again for the text that follows.
//
// Asserted from VRAM, names and attributes, because `screen.text` has no way to
// say what colour a cell is and no promise about how it renders $DB-$DF. The
// table below is the picture; the serial header case proves it is absent there.

import { hardwareLine } from '../lib/boot.mjs'
import { VID_PEN, VID_TOP, ATTRIBUTES } from '../lib/cells.mjs'

export const name = 'the header logo draws in colour on a video console, and the pen is put back'
export const profile = 'video'

const HW_PRESENT = 0x030d
const COLOR = 0x07
const PEN = 0x1f // KernalInit's pen: black on white

const ROWS = [
  // first row 1, starting at column 12
  ['█▀▀ █▀▀ █▀█ ▀▀█', 6], //  dark red
  ['█▄▄ █▄▄ █ █ ▄▄█', 8], //  medium red
  ['█ █   █ █ █ █', 10], //   dark yellow
  ['█▄█ ▄▄█ █▄█ █▄▄', 2], //  medium green
]
const LEFT = 12
const CP437 = { ' ': 0x20, '█': 0xdb, '▄': 0xdc, '▀': 0xdf }

export async function run(m) {
  await m.reset(true)
  await m.start()
  let lines = null
  for (let i = 0; i < 16 && !lines; i++) {
    await m.waitFor({ cycles: 250000, run: 'turbo', timeoutMs: 30000 })
    const screen = await m.screenText()
    if (screen.some((line) => line.startsWith('OK'))) lines = screen
  }
  m.assert(lines, 'the prompt never appeared')
  await m.pause()
  m.assertByte(await m.peek(VID_TOP), 0, 'VID_TOP: the header scrolled, so the rows below are not where they were drawn')

  const names = await m.read(0, 960, 'vram')
  const attributes = await m.read(ATTRIBUTES, 960, 'vram')
  const row = (buffer, r) => Array.from(buffer.subarray(r * 40, r * 40 + 40))

  // Row 0 is the blank line the header has always started with.
  m.assertBytes(row(names, 0), Array(40).fill(0x20), 'row 0\'s characters')
  m.assertBytes(row(attributes, 0), Array(40).fill(PEN), 'row 0\'s colours')

  ROWS.forEach(([text, colour], i) => {
    const r = 1 + i
    const drawn = LEFT + text.length
    const expectedNames = Array(40).fill(0x20)
    ;[...text].forEach((ch, c) => (expectedNames[LEFT + c] = CP437[ch]))
    const band = (colour << 4) | (PEN & 0x0f)
    const expectedAttributes = Array.from({ length: 40 }, (_, c) => (c < drawn ? band : PEN))
    m.assertBytes(row(names, r), expectedNames, `logo row ${i}'s characters`)
    m.assertBytes(row(attributes, r), expectedAttributes, `logo row ${i}'s colours`)
  })

  // A blank line, then the title in the default pen.
  m.assertBytes(row(names, 5), Array(40).fill(0x20), 'the line under the logo')
  const title = lines.findIndex((line) => line.startsWith('6502 BIOS v'))
  m.assertEqual(title, 6, 'the title\'s row')
  m.assertEqual(lines[title + 2].trimEnd(), hardwareLine(await m.peek(HW_PRESENT)), 'the hardware line')
  m.assertBytes(row(attributes, title), Array(40).fill(PEN), 'the title\'s colours')

  m.assertByte(await m.peek(VID_PEN), PEN, 'VID_PEN after the header')
  m.assertByte((await m.videoRegisters())[COLOR], PEN, 'the border after the header')
}
