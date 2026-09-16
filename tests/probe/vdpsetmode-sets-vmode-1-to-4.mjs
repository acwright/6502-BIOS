// VDP-PLAN §6, $A0B7: `VdpSetMode` writes `VMODE` 1-4 and `VID_MODE` with it,
// and refuses anything else with carry set and nothing written — 0 included,
// since the legacy submode is `KernalInit`'s business, not a mode to ask for.

import { vdpCall, VdpSetMode } from '../lib/vdp.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'VdpSetMode sets VMODE 1 to 4 and refuses the rest'
export const profile = 'video'

const GEOMETRY = { 1: 'text', 2: 'compact', 3: 'graphics', 4: 'full' }

export async function run(m) {
  for (const mode of [2, 3, 4]) {
    const r = await vdpCall(m, VdpSetMode, { A: mode })
    m.assert(!r.carry, `carry set for mode ${mode}`)
    const info = await m.videoInfo()
    m.assertEqual(info.mode.vmode, mode, `VMODE after VdpSetMode ${mode}`)
    m.assertEqual(info.mode.geometry, GEOMETRY[mode], `the geometry after VdpSetMode ${mode}`)
    m.assertByte(await m.peek(VID_MODE), mode, `VID_MODE after VdpSetMode ${mode}`)
  }

  const text = await vdpCall(m, VdpSetMode, { A: 1 })
  m.assert(!text.carry, 'carry set for mode 1')
  m.assertEqual((await m.videoInfo()).mode.vmode, 1, 'VMODE after VdpSetMode 1')
  m.assertByte(await m.peek(VID_MODE), 0x81, 'VID_MODE after VdpSetMode 1 from Full: not the console yet')

  for (const bad of [0, 5, 0x81]) {
    const r = await vdpCall(m, VdpSetMode, { A: bad })
    m.assert(r.carry, `carry clear for mode $${bad.toString(16)}`)
    m.assertEqual((await m.videoInfo()).mode.vmode, 1, `VMODE after VdpSetMode $${bad.toString(16)}`)
  }
}
