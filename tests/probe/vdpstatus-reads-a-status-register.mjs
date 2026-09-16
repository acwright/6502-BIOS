// VDP-PLAN §6, $A0D5: `VdpStatus` reads STATn on port A and puts `STATSEL_A`
// back to 0 without reading `STAT0` — so reading `STAT4` or `STAT6` leaves
// `STAT0`'s F set for whoever polls it. X and Y come back unchanged.

import { vdpCall, VdpStatus } from '../lib/vdp.mjs'

export const name = 'VdpStatus reads a status register and leaves STATSEL_A at 0 and STAT0 unread'
export const profile = 'video'

const STATSEL_A = 0x0f
const F = 0x80

export async function run(m) {
  const { status } = await m.videoInfo()
  m.assert(status[0] & F, 'STAT0 F is clear at the prompt, so it cannot show being left alone')

  for (const [n, expected] of [[4, 0xac], [5, status[5]], [6, status[6]]]) {
    const r = await vdpCall(m, VdpStatus, { X: n, Y: 0x77 })
    m.assert(!r.carry, `STAT${n}: carry set`)
    m.assertByte(r.A, expected, `STAT${n}`)
    m.assertByte(r.X, n, `STAT${n}: X preserved`)
    m.assertByte(r.Y, 0x77, `STAT${n}: Y preserved`)
    m.assertByte((await m.videoRegisters())[STATSEL_A], 0, `STATSEL_A after STAT${n}`)
    m.assert((await m.videoInfo()).status[0] & F, `STAT0 F after reading STAT${n}`)
  }

  // STAT0 itself is read as asked, and that read acknowledges F.
  const stat0 = await vdpCall(m, VdpStatus, { X: 0 })
  m.assert(stat0.A & F, 'STAT0 as VdpStatus read it')
  m.assert(!((await m.videoInfo()).status[0] & F), 'STAT0 F after VdpStatus read STAT0')

  const refused = await vdpCall(m, VdpStatus, { X: 16 })
  m.assert(refused.carry, 'carry clear for STAT16')
}
