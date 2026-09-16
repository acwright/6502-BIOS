// VDP-PLAN §5 Phase 5: $A0C9 `VdpLoadFont` is published now, as a stub that
// returns carry set and writes nothing, so the slot is taken and a caller can
// tell it did not load. Phase 8 makes it issue SPEC draft 0.5's `FONT` command
// and wait for it; this case goes then, replaced by the real one.

import { vdpCall, VdpLoadFont } from '../lib/vdp.mjs'

export const name = 'VdpLoadFont returns carry set and touches nothing until Phase 8'
export const profile = 'video'

export async function run(m) {
  const before = await m.read(0x0800, 0x800, 'vram')
  const r = await vdpCall(m, VdpLoadFont, { A: 0 })
  m.assert(r.carry, 'carry clear from the stub')
  m.assertBytes(await m.read(0x0800, 0x800, 'vram'), before, 'the pattern table')
}
