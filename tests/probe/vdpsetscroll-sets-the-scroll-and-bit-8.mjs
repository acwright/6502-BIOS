// VDP-PLAN §6, $A0CF: `VdpSetScroll` writes a layer's `LxSCRX` (bits 7:0 from
// A), `LxSCRY` (Y) and `LxCTRL` b6 (X bit 8, from `VDP_P0`), keeping `LxCTRL`'s
// other bits from the shadow. x = 300 is $12C: 44 in the register and b6 set,
// the numbers the plan's `SCROLL 1,300,10` case expects.

import { vdpCall, VdpSetScroll, VDP_P0, VDP_L0CTRL_SHADOW } from '../lib/vdp.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'VdpSetScroll sets a layer\'s scroll, X bit 8 included, and keeps LxCTRL\'s other bits'
export const profile = 'video'

const SCRX = [0x13, 0x1b]
const SCRY = [0x14, 0x1c]
const CTRL = [0x15, 0x1d]

export async function run(m) {
  for (const layer of [1, 0]) {
    const shadow = await m.peek(VDP_L0CTRL_SHADOW + layer)
    m.assertByte(shadow & 0x40, 0, `layer ${layer}: the shadow's b6 to start with`)

    await m.write(VDP_P0, [1])
    let r = await vdpCall(m, VdpSetScroll, { X: layer, A: 44, Y: 10 })
    m.assert(!r.carry, `layer ${layer}: carry set`)
    let reg = await m.videoRegisters()
    m.assertByte(reg[SCRX[layer]], 44, `layer ${layer}: LxSCRX for x = 300`)
    m.assertByte(reg[SCRY[layer]], 10, `layer ${layer}: LxSCRY`)
    m.assertByte(reg[CTRL[layer]], shadow | 0x40, `layer ${layer}: LxCTRL with b6 set`)
    m.assertByte(await m.peek(VDP_L0CTRL_SHADOW + layer), shadow | 0x40, `layer ${layer}: the shadow`)

    await m.write(VDP_P0, [0])
    r = await vdpCall(m, VdpSetScroll, { X: layer, A: 7, Y: 200 })
    reg = await m.videoRegisters()
    m.assertByte(reg[SCRX[layer]], 7, `layer ${layer}: LxSCRX for x = 7`)
    m.assertByte(reg[SCRY[layer]], 200, `layer ${layer}: LxSCRY for y = 200`)
    m.assertByte(reg[CTRL[layer]], shadow, `layer ${layer}: LxCTRL with b6 clear again`)
  }
  m.assertByte(await m.peek(VID_MODE), 0x81, 'VID_MODE after VdpSetScroll')

  const before = await m.videoRegisters()
  const refused = await vdpCall(m, VdpSetScroll, { X: 2, A: 1, Y: 1 })
  m.assert(refused.carry, 'carry clear for layer 2')
  m.assertBytes(await m.videoRegisters(), before, 'the registers after layer 2 was refused')
}
