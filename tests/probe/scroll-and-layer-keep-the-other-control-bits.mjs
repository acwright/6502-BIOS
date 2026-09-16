// VDP-PLAN §7: SCROLL layer,x,y writes LxSCRX, LxSCRY and x's bit 8 into LxCTRL
// b6; LAYER layer,on sets or clears LxCTRL b4. Both keep LxCTRL's other bits,
// from the shadow, and both take the console out of Text mode.
//
// A program does it and then loops, since the prompt afterwards puts the Text
// console's layer registers back.

import { typeProgram, typeLine, ctrlC, awaitScreen } from '../lib/video.mjs'
import { VID_MODE } from '../lib/cells.mjs'
import { VDP_L0CTRL_SHADOW, VDP_L1CTRL_SHADOW } from '../lib/vdp.mjs'

export const name = 'SCROLL sets the scroll and bit 8, and LAYER toggles the enable bit, keeping LxCTRL\'s other bits'
export const profile = 'video'

async function looped(m, statements) {
  await typeProgram(m, [`10 ${statements}`, '20 GOTO 20'])
  await typeLine(m, 'RUN')
  await m.waitFor({ cycles: 1_000_000, run: 'turbo', timeoutMs: 30000 })
  await m.pause()
  return m.videoRegisters()
}

async function stop(m) {
  await ctrlC(m)
  await awaitScreen(m, (s) => s.some((l) => l.startsWith('BREAK IN 20')), 'the break')
}

export async function run(m) {
  // The Text console: L0CTRL $30, L1CTRL $0C.
  let r = await looped(m, 'SCROLL 1, 300, 10 : LAYER 1, 1')
  m.assertByte(r[0x1b], 44, 'SCROLL 1, 300, 10: L1SCRX')
  m.assertByte(r[0x1c], 10, 'SCROLL 1, 300, 10: L1SCRY')
  m.assertByte(r[0x1d], 0x5c, 'L1CTRL after SCROLL 1, 300, 10 : LAYER 1, 1 — $0C with b6 and b4')
  m.assertByte(await m.peek(VDP_L1CTRL_SHADOW), 0x5c, 'the L1CTRL shadow')
  m.assertByte(await m.peek(VID_MODE), 0x81, 'VID_MODE after SCROLL and LAYER')
  await stop(m)

  r = await looped(m, 'LAYER 0, 0 : SCROLL 0, 255, 7')
  m.assertByte(r[0x15], 0x20, 'L0CTRL after LAYER 0, 0 : SCROLL 0, 255, 7 — $30 without b4, b6 clear')
  m.assertByte(r[0x13], 255, 'SCROLL 0, 255, 7: L0SCRX')
  m.assertByte(await m.peek(VDP_L0CTRL_SHADOW), 0x20, 'the L0CTRL shadow')
  await stop(m)

  // And the prompt put the Text console's layer 0 back.
  m.assertByte((await m.videoRegisters())[0x15], 0x30, 'L0CTRL at the prompt')
}
