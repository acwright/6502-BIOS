// VDP-PLAN §4.3, per-cell colour: two pens on one line, and a cell nobody
// printed in, each keep their own attribute.
//
// On 1.x `COLOR` recoloured the whole screen, because the TMS9918's text mode has
// one colour register and nothing per cell. The 2.0 console writes the pen into
// the attribute table beside each character, so changing it changes only what
// comes next — which is exactly what a whole-screen colour register would fail:
// the first character would read back in the second pen.

import { run as runLine } from '../lib/video.mjs'
import { findCell, vram, NAME_TABLE_SIZE, ATTRIBUTES } from '../lib/cells.mjs'

export const name = 'each cell keeps the colour it was printed in'
export const profile = 'video'

export async function run(m) {
  await runLine(
    m,
    'CLS : COLOR 6,15 : PRINT CHR$(64); : COLOR 2,11 : PRINT CHR$(35);',
    (lines) => lines.some((line) => line.includes('@#')),
    'printed in two pens',
  )
  const names = await vram(m, 0, NAME_TABLE_SIZE)
  const attributes = await vram(m, ATTRIBUTES, NAME_TABLE_SIZE)

  const first = findCell(m, names, 0x40, 'printed in the first pen')
  const second = findCell(m, names, 0x23, 'printed in the second pen')
  m.assertEqual(second, first + 1, 'the two characters are side by side')
  m.assertByte(attributes[first], 0x6f, 'the attribute of the cell printed after COLOR 6,15')
  m.assertByte(attributes[second], 0x2b, 'the attribute of the cell printed after COLOR 2,11')

  // The rest of that row was cleared by CLS in the default pen and printed in by
  // nobody. The prompt goes on the next row, in the pen the line left behind.
  m.assertEqual(names[second + 1], 0x20, 'the cell after the two characters is blank')
  m.assertByte(attributes[second + 1], 0x1f, 'the attribute of a cell CLS cleared and nobody printed in')
}
