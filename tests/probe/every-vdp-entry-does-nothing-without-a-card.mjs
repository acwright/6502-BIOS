// VDP-PLAN §5 Phase 5: with no PICOVDP fitted, every one of the 13 VDP entries
// returns carry set and writes nothing to $9C00-$9C03 — the promise a
// cartridge relies on to run on a machine without the card, and the one that
// keeps a stray write off whatever else decodes that slot.
//
// The serial profile's video slot is empty. As in
// no-video-card-nothing-reaches-the-vdp, "nothing was written" is only worth
// something if a write would have been seen, so one entry is first called with
// the video bit forced on, where it must hit the watchpoint.

import * as vdp from '../lib/vdp.mjs'

export const name = 'with no video card, every VDP entry returns carry set and writes nothing'

const VC_DATA = 0x9c00
const VC_REG2 = 0x9c03
const HW_PRESENT = 0x030d
const HW_VID = 0x80

const STR_PTR = 0x0002
const FS_IO_ADDR = 0x037f
const NAME = 0x7e00

// Arguments that would do something with a card: in range, a real register.
const ENTRIES = [
  ['VdpInfo', vdp.VdpInfo, {}],
  ['VdpWriteReg', vdp.VdpWriteReg, { A: 0x44, X: 0x07 }],
  ['VdpSetMode', vdp.VdpSetMode, { A: 2 }],
  ['VdpPoke', vdp.VdpPoke, { A: 0x55, X: 0x00, Y: 0x40 }],
  ['VdpPeek', vdp.VdpPeek, { X: 0x00, Y: 0x40 }],
  ['VdpSetPalette', vdp.VdpSetPalette, { X: 1, A: 0x0f, Y: 0xff }],
  ['WaitVBlank', vdp.WaitVBlank, {}],
  ['VdpLoadFile', vdp.VdpLoadFile, {}],
  ['VdpLoadFont', vdp.VdpLoadFont, { A: 0 }],
  ['VdpSprite', vdp.VdpSprite, { X: 3 }],
  ['VdpSetScroll', vdp.VdpSetScroll, { X: 0, A: 8, Y: 8 }],
  ['VdpLayer', vdp.VdpLayer, { X: 1, A: 1 }],
  ['VdpStatus', vdp.VdpStatus, { X: 4 }],
]

async function watchedCall(m, address, regs) {
  await m.clearBreaks()
  await m.watch(VC_DATA, 'write', { end: VC_REG2 })
  const before = await m.regs()
  const returnTo = await m.plantCall(address, regs)
  const result = await m.runTo(returnTo)
  await m.clearBreaks()
  const { PC, SP, P, A, X, Y } = before
  await m.setRegs({ PC, SP, P, A, X, Y })
  return { kind: result.stop?.kind, carry: (result.registers.P & 0x01) !== 0, registers: result.registers }
}

export async function run(m) {
  const present = await m.peek(HW_PRESENT)
  m.assert((present & HW_VID) === 0, 'this profile was supposed to have no video card')
  m.assertEqual(ENTRIES.length, 13, 'the VDP entries')

  await m.write(NAME, [...Buffer.from('HELLO.BAS', 'ascii'), 0])
  await m.write(STR_PTR, [NAME & 0xff, NAME >> 8])
  await m.write(FS_IO_ADDR, [0x00, 0x40])

  await m.write(HW_PRESENT, [present | HW_VID])
  m.assertEqual((await watchedCall(m, vdp.VdpWriteReg, { A: 0x44, X: 0x07 })).kind, 'watchpoint', 'VdpWriteReg with the video bit set: it should write the VDP')
  await m.write(HW_PRESENT, [present])

  for (const [label, address, regs] of ENTRIES) {
    const r = await watchedCall(m, address, regs)
    m.assertEqual(r.kind, 'breakpoint', `${label} with no video card: it should return without writing`)
    m.assert(r.carry, `${label} with no video card: carry clear`)
  }

  const info = await watchedCall(m, vdp.VdpInfo, { A: 0x11, X: 0x22, Y: 0x33 })
  m.assertBytes([info.registers.A, info.registers.X, info.registers.Y], [0, 0, 0], 'VdpInfo\'s A, X and Y with no card')
}
