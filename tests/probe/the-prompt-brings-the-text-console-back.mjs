// VDP-PLAN §5 Phase 6, step 2: however a program stops — END, running off its
// last line, STOP, an error, Ctrl+C — BASIC puts the Text console back before
// it says anything, so the message and the OK prompt are readable. So does a
// direct-mode line, since the prompt after it needs text too.
//
// The program's mode is faked the way a-brk-brings-the-text-console-back fakes
// it: Graphics (VMODE 3) on the card, and VID_MODE = 3 — which is what
// VdpWriteReg leaves after a VMODE write — poked by the program itself. The
// card's register is the evidence InitVideo ran; the message on the screen is
// the evidence it ran *before* the message was printed, since InitVideo + CLS
// afterwards would have wiped it.
//
// And the other half: with VID_MODE still $01 nothing is reset, so what a
// program printed is still on the screen at the prompt.

import { typeLine, awaitScreen, render, typeProgram, ctrlC } from '../lib/video.mjs'
import { VID_MODE, REG_VMODE } from '../lib/cells.mjs'

export const name = 'END, STOP, an error, Ctrl+C and a direct line out of Text mode all come back to the Text console'
export const profile = 'video'

const FAKE = 'POKE 915,3'

async function inGraphics(m) {
  await m.call('video.setRegister', { register: REG_VMODE, value: 3 })
}

async function assertText(m, lines, what) {
  const { mode } = await m.videoInfo()
  m.assertEqual(mode.vmode, 1, `VMODE after ${what}`)
  m.assertByte(await m.peek(VID_MODE), 0x01, `VID_MODE after ${what}`)
  // CLS ran, so the program's own lines are gone: nothing typed before is left.
  m.assert(!lines.some((l) => l.includes('POKE')), `${what}: the screen was not cleared before the message. It reads:\n${render(lines)}`)
}

const program = typeProgram

const shows = (text) => (lines) => lines.some((l) => l.startsWith(text)) && lines.some((l) => l.startsWith('OK'))

export async function run(m) {
  const cases = [
    { what: 'END', lines: [`10 ${FAKE} : END`], message: 'OK' },
    { what: 'running off the last line', lines: [`10 ${FAKE}`], message: 'OK' },
    { what: 'STOP', lines: [`10 ${FAKE} : STOP`], message: 'BREAK IN 10' },
    { what: 'an error', lines: [`10 ${FAKE} : X = 1 / 0`], message: '?DIVISION BY ZERO ERROR IN 10' },
  ]
  for (const { what, lines, message } of cases) {
    await program(m, lines)
    await inGraphics(m)
    await typeLine(m, 'RUN')
    const screen = await awaitScreen(m, shows(message), `${JSON.stringify(message)} after ${what}`)
    await assertText(m, screen, what)
  }

  // Ctrl+C, put straight into the input buffer while the loop runs.
  await program(m, [`10 ${FAKE}`, '20 GOTO 20'])
  await inGraphics(m)
  await typeLine(m, 'RUN')
  await m.waitFor({ cycles: 300000, run: 'turbo', timeoutMs: 30000 })
  await ctrlC(m)
  const broken = await awaitScreen(m, shows('BREAK IN 20'), 'BREAK IN 20 after Ctrl+C')
  await assertText(m, broken, 'Ctrl+C')

  // A direct-mode line.
  await inGraphics(m)
  await typeLine(m, FAKE)
  const direct = await awaitScreen(m, (s) => s.some((l) => l.startsWith('OK')), 'OK after a direct line')
  const { mode } = await m.videoInfo()
  m.assertEqual(mode.vmode, 1, 'VMODE after a direct line')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE after a direct line')
  m.assert(direct.some((l) => l.startsWith('OK')), `no OK after a direct line:\n${render(direct)}`)

  // Text console intact: the program's output is still there at the prompt.
  await program(m, ['10 PRINT "STILL HERE"'])
  await typeLine(m, 'RUN')
  const kept = await awaitScreen(m, (s) => s.some((l) => l.startsWith('STILL HERE')), 'the program\'s output')
  m.assert(kept.some((l) => l.startsWith('10 PRINT')), `the screen was cleared although VID_MODE was $01:\n${render(kept)}`)
}
