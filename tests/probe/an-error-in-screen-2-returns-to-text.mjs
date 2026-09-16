// VDP-PLAN §5 Phase 6: an error in a program that left Text mode is reported on
// the Text console. SCREEN 2 moves every table, so what has to come back is the
// console's own layout — the registers InitVideo writes — with the message on it.

import { typeProgram, typeLine, awaitScreen, render } from '../lib/video.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'an error in SCREEN 2 is reported on the Text console'
export const profile = 'video'

export async function run(m) {
  await typeProgram(m, ['10 SCREEN 2', '20 X = 1 / 0'])
  await typeLine(m, 'RUN')
  const screen = await awaitScreen(
    m,
    (s) => s.some((l) => l.startsWith('?DIVISION BY ZERO ERROR IN 20')) && s.some((l) => l.startsWith('OK')),
    'the error and the prompt',
  )
  const { mode } = await m.videoInfo()
  m.assertEqual(mode.geometry, 'text', 'the geometry after the error')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE after the error')
  const r = await m.videoRegisters()
  m.assertBytes([r[0x10], r[0x11], r[0x12], r[0x15], r[0x1d], r[0x23]], [0x00, 0x01, 0x01, 0x30, 0x0c, 0x26], 'L0NAME, L0ATTR, L0PAT, L0CTRL, L1CTRL, SPRCTRL')
  m.assert(!screen.some((l) => l.startsWith('10 SCREEN')), `the screen was not cleared:\n${render(screen)}`)
}
