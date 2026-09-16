// VDP-PLAN §5 Phase 5 and §6, $A0C3: `WaitVBlank` returns as vertical blanking
// begins — the display line is the mode's active line count, 192 in Text — and
// it gets there by polling `STAT3`, not `STAT0`, so `F` is still set for a
// program that polls `STAT0` itself. `STATSEL_A` is back at 0.
//
// Three calls in a row. The first starts wherever the frame happens to be; the
// other two start in the blank the last one returned in, so each has to wait a
// whole frame — which is what tells "at the start of the next blank" from
// "whenever b0 is set".

import { vdpCall, WaitVBlank } from '../lib/vdp.mjs'

export const name = 'WaitVBlank returns at the start of vertical blanking and leaves STAT0 alone'
export const profile = 'video'

const STATSEL_A = 0x0f
const F = 0x80
const ACTIVE_LINES = 192

export async function run(m) {
  m.assert((await m.videoInfo()).status[0] & F, 'STAT0 F is clear at the prompt, so it cannot show being left alone')

  let previous = null
  for (let call = 0; call < 3; call++) {
    const r = await vdpCall(m, WaitVBlank)
    const info = await m.videoInfo()
    const cycles = await m.cycles()
    m.assert(!r.carry, `call ${call}: carry set`)
    m.assertEqual(info.displayLine, ACTIVE_LINES, `call ${call}: the display line on return`)
    m.assert(info.status[0] & F, `call ${call}: STAT0 F was consumed`)
    m.assertByte((await m.videoRegisters())[STATSEL_A], 0, `call ${call}: STATSEL_A`)
    if (previous !== null) {
      const frame = cycles - previous
      m.assert(frame > 10000 && frame < 25000, `call ${call}: ${frame} cycles since the last return, not one frame`)
    }
    previous = cycles
  }
}
