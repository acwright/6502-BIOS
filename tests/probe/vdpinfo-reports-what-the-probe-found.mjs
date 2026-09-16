// VDP-PLAN §6, $A0B1: `VdpInfo` hands back what the boot probe found — `VDP_FW`
// in A, `VDP_CAPS` in X, the identification byte in Y, carry clear — checked
// against the card's own status registers, which `video.info` peeks.

import { vdpCall, VdpInfo } from '../lib/vdp.mjs'

export const name = 'VdpInfo reports the firmware and capabilities the probe found'
export const profile = 'video'

export async function run(m) {
  const { status } = await m.videoInfo()
  const r = await vdpCall(m, VdpInfo, { A: 0x11, X: 0x22, Y: 0x33 })
  m.assert(!r.carry, 'carry is set with a card fitted')
  m.assertByte(r.A, status[5], 'A against STAT5')
  m.assertByte(r.X, status[6], 'X against STAT6')
  m.assertByte(r.Y, 0xac, 'Y, the identification byte')
}
