// README § NVRAM Save Slots: with no RTC fitted, every save-slot entry sets
// carry and does nothing.
//
// These six check HW_PRESENT themselves, unlike the raw RtcReadNVRAM pair, and
// that is not a nicety. A floating bus can hand back a pattern that passes a
// 15-byte checksum by chance, which would give a game a save that was never
// written. So the claim is about the bus: not one read or write of the clock
// card's registers, caught by an access watchpoint over all of them.

import {
  NvStat, NvRead, NvWrite, NvErase, NvFind, NvFormat,
  NV_ID, SRC, DEST, lo, hi, hex,
} from '../lib/nvslots.mjs'

export const name = 'with no clock card, the save-slot routines set carry and touch no register'
export const hw = '-rtc'

const RTC_BASE = 0x8800
const RTC_END = 0x881f

async function slot(m, address, what, regs) {
  await m.clearBreaks()
  await m.watch(RTC_BASE, 'access', { end: RTC_END })
  const before = await m.regs()
  const returnTo = await m.plantCall(address, regs)
  const result = await m.runTo(returnTo)
  await m.clearBreaks()
  if (result.stop?.kind === 'watchpoint') {
    m.fail(`${what} accessed ${hex(result.stop.address, 4)} with no clock card fitted`)
  }
  m.assertEqual(result.stop?.kind, 'breakpoint', `how ${what} stopped`)
  m.assertEqual((result.registers.P & 0x01) !== 0, true, `${what}: carry`)
  const { PC, SP, P, A, X, Y } = before
  await m.setRegs({ PC, SP, P, A, X, Y })
}

export async function run(m) {
  await m.write(NV_ID, 0x42)
  await slot(m, NvStat, 'NvStat', { X: 0 })
  await slot(m, NvRead, 'NvRead', { X: 0, A: lo(DEST), Y: hi(DEST) })
  await slot(m, NvWrite, 'NvWrite', { X: 0, A: lo(SRC), Y: hi(SRC) })
  await slot(m, NvErase, 'NvErase', { X: 0 })
  await slot(m, NvFind, 'NvFind', { A: 0x42 })
  await slot(m, NvFind, 'NvFind of a free slot', { A: 0 })
  await slot(m, NvFormat, 'NvFormat', {})
}
