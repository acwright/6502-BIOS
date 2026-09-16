// VDP-PLAN §6, $A0D2: `VdpLayer` sets or clears `LxCTRL` b4 and keeps every
// other bit, from the shadow `VdpWriteReg` keeps — which is the only way to
// know them, since the register reads back as nothing.

import { vdpCall, VdpLayer, VdpWriteReg, VDP_L0CTRL_SHADOW } from '../lib/vdp.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'VdpLayer shows and hides a layer and keeps LxCTRL\'s other bits'
export const profile = 'video'

const CTRL = [0x15, 0x1d]

export async function run(m) {
  // Layer 1 given bits of every kind first, through the entry that keeps the shadow.
  await vdpCall(m, VdpWriteReg, { A: 0x6a, X: CTRL[1] })

  for (const [layer, start] of [[1, 0x6a], [0, 0x30]]) {
    m.assertByte(await m.peek(VDP_L0CTRL_SHADOW + layer), start, `layer ${layer}: the shadow to start with`)
    for (const [on, expected] of [[1, start | 0x10], [0, start & ~0x10], [0x80, start | 0x10]]) {
      const r = await vdpCall(m, VdpLayer, { X: layer, A: on })
      m.assert(!r.carry, `layer ${layer}, A = ${on}: carry set`)
      m.assertByte((await m.videoRegisters())[CTRL[layer]], expected, `layer ${layer}, A = ${on}: LxCTRL`)
      m.assertByte(await m.peek(VDP_L0CTRL_SHADOW + layer), expected, `layer ${layer}, A = ${on}: the shadow`)
    }
  }
  m.assertByte(await m.peek(VID_MODE), 0x81, 'VID_MODE after VdpLayer')

  const refused = await vdpCall(m, VdpLayer, { X: 2, A: 1 })
  m.assert(refused.carry, 'carry clear for layer 2')
}
