// VDP-PLAN decision 2: VPOKE does not take VID_MODE off $01, so a program that
// redefines characters in the Text console's pattern table ($0800) keeps them
// after END. Restoring on every stop would reload the font and lose them.

import { typeProgram, typeLine, awaitScreen } from '../lib/video.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'glyphs redefined with VPOKE survive END in Text mode'
export const profile = 'video'

const GLYPH = 0x0800 + 0xc0 * 8 // character 192

export async function run(m) {
  const before = await m.read(GLYPH, 8, 'vram')
  const pattern = [0x81, 0x42, 0x24, 0x18, 0x18, 0x24, 0x42, 0x81]
  m.assert(before.some((b, i) => b !== pattern[i]), 'the glyph already holds the pattern')
  await typeProgram(m, [
    `10 FOR I = 0 TO 7 : READ B : VPOKE ${GLYPH} + I, B : NEXT`,
    `20 DATA ${pattern.join(',')}`,
    '30 END',
  ])
  await typeLine(m, 'RUN')
  await awaitScreen(m, (s) => s.filter((l) => l.startsWith('OK')).length >= 2, 'OK after RUN')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE after the VPOKEs')
  m.assertBytes(await m.read(GLYPH, 8, 'vram'), pattern, 'character 192\'s glyph at the prompt')
}
