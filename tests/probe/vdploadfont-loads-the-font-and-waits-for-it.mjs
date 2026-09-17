// VDP-PLAN §6, $A0C9: `VdpLoadFont` writes the font ID to `FONT` ($30) and
// returns once the copy has landed. SPEC §7 lands it at the line start where
// vertical blank begins, so the entry returns at display line 192, with the
// font in place and `STAT0` F not consumed.
//
// The destination is `L0PAT` as it stands at the write, not a fixed $0800, so
// the case moves `L0PAT` first. Font $00 is the only one `STAT6` b7 promises;
// any other ID is refused with carry set, and nothing is written to `FONT`.

import { vdpCall, VdpLoadFont } from '../lib/vdp.mjs'
import { cp437Font, FONT_SIZE, REG_FONT, REG_L0PAT } from '../lib/font.mjs'

export const name = 'VdpLoadFont loads font $00 at L0PAT and returns once it has landed; other IDs are refused'
export const profile = 'video'

const ACTIVE_LINES = 192
const F = 0x80
const DESTINATION = 0x3000 // L0PAT = $06
const JUNK = 0xc3

export async function run(m) {
  const font = cp437Font()

  await m.call('video.setRegister', { register: REG_L0PAT, value: DESTINATION / 0x800 })
  await m.fillMem(DESTINATION, FONT_SIZE, JUNK, 'vram')
  await m.call('video.setRegister', { register: REG_FONT, value: 0x55 }) // a reserved ID: stored, loads nothing

  // Refused IDs: a reserved one, and one with b7 (layer 1) set.
  for (const id of [0x01, 0x7f, 0x80]) {
    const r = await vdpCall(m, VdpLoadFont, { A: id })
    m.assert(r.carry, `font $${id.toString(16)}: carry clear`)
    m.assertByte((await m.videoRegisters())[REG_FONT], 0x55, `font $${id.toString(16)}: FONT was written`)
  }
  m.assert((await m.read(DESTINATION, FONT_SIZE, 'vram')).every((b) => b === JUNK), 'a refused ID loaded something')

  const r = await vdpCall(m, VdpLoadFont, { A: 0x00 })
  const info = await m.videoInfo()
  m.assert(!r.carry, 'font $00: carry set')
  m.assertByte((await m.videoRegisters())[REG_FONT], 0x00, 'FONT after the load')
  m.assertEqual(info.displayLine, ACTIVE_LINES, 'the display line on return')
  m.assert(info.status[0] & F, 'STAT0 F was consumed')
  m.assertBytes(await m.read(DESTINATION, FONT_SIZE, 'vram'), font, 'the pattern table at L0PAT on return')
}
