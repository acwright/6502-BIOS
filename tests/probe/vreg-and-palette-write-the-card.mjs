// VDP-PLAN §7: VREG reg,value writes a register through VdpWriteReg, so a VMODE
// write keeps VID_MODE; PALETTE index,r,g,b writes $0R $GB at $FC00 + 2 * index.
// Neither register nor palette writes take the console out of Text mode, so
// the prompt afterwards clears nothing.

import { typeProgram, typeLine, awaitScreen, awaitVmode, ctrlC, render } from '../lib/video.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'VREG writes a register and keeps VID_MODE; PALETTE writes an entry at $FC00 + 2n'
export const profile = 'video'

export async function run(m) {
  await typeProgram(m, ['10 VREG 28, 9 : VREG 7, 52 : PALETTE 200, 1, 2, 3 : PALETTE 0, 15, 14, 13', '20 PRINT "DONE"'])
  await typeLine(m, 'RUN')
  const screen = await awaitScreen(m, (s) => s.some((l) => l.startsWith('DONE')) && s.at(-1) !== null, 'DONE')
  const registers = await m.videoRegisters()
  m.assertByte(registers[0x1c], 9, 'VREG 28, 9: L1SCRY')
  m.assertByte(registers[7], 52, 'VREG 7, 52: COLOR')
  m.assertBytes(await m.read(0xfc00 + 400, 2, 'vram'), [0x01, 0x23], 'PALETTE 200, 1, 2, 3 at $FD90')
  m.assertBytes(await m.read(0xfc00, 2, 'vram'), [0x0f, 0xed], 'PALETTE 0, 15, 14, 13 at $FC00')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE after VREG and PALETTE')
  m.assert(screen.some((l) => l.startsWith('10 VREG')), `the prompt cleared the screen:\n${render(screen)}`)

  await typeProgram(m, ['10 VREG 13, 3', '20 GOTO 20'])
  await typeLine(m, 'RUN')
  await awaitVmode(m, 3, 'after VREG 13, 3')
  m.assertByte(await m.peek(VID_MODE), 0x03, 'VID_MODE after VREG 13, 3')
  await ctrlC(m)
  await awaitScreen(m, (s) => s.some((l) => l.startsWith('BREAK IN 20')), 'the break')
  m.assertEqual((await m.videoInfo()).mode.vmode, 1, 'VMODE at the prompt after VREG 13, 3')
}
