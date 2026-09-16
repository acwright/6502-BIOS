// VDP-PLAN §5 Phase 6: Ctrl+C out of a program in SCREEN 1 prints BREAK IN on
// the Text console, and CONT would carry on from there.

import { typeProgram, typeLine, awaitScreen, awaitVmode, ctrlC } from '../lib/video.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'Ctrl+C in SCREEN 1 breaks to the Text console'
export const profile = 'video'

export async function run(m) {
  await typeProgram(m, ['10 SCREEN 1', '20 GOTO 20'])
  await typeLine(m, 'RUN')
  await awaitVmode(m, 2, 'after SCREEN 1')
  await ctrlC(m)
  await awaitScreen(m, (s) => s.some((l) => l.startsWith('BREAK IN 20')) && s.some((l) => l.startsWith('OK')), 'BREAK IN 20')
  m.assertEqual((await m.videoInfo()).mode.geometry, 'text', 'the geometry after Ctrl+C')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE after Ctrl+C')
}
