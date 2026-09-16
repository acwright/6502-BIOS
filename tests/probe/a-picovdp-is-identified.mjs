// VDP-PLAN §4.1: the probe identifies the card by `STAT4` = `$AC`, records
// `STAT5` in `VDP_FW` and `STAT6` in `VDP_CAPS`, and puts port A's status select
// back to `STAT0` when it is done.
//
// Each claim is checked against the card itself rather than against constants.
// `STAT5` is the firmware version, which moves with every spec draft the card
// implements and gates nothing; what the Kernal promises is that it recorded
// what the card said. `video.info` peeks the status registers, so reading them
// here clears nothing a later case could be relying on.
//
// The status select matters because it is shared with every program that
// polls `STAT0` on port A — the TMS9918 idiom of `bit VC_STATUS` for vertical
// blank. A probe that left `STATSEL_A` on `STAT6` would hand that program a
// constant `$BF` with b7 set, which reads as a frame ending on every poll.

export const name = 'a PICOVDP is identified by STAT4, and STAT5 and STAT6 are recorded'
export const profile = 'video'

const HW_PRESENT = 0x030d
const HW_VID = 0x80
const VDP_FW = 0x0394
const VDP_CAPS = 0x0395

const VDP_ID = 0xac
const STATSEL_A = 0x0f

export async function run(m) {
  const info = await m.videoInfo()
  m.assertByte(info.status[4], VDP_ID, 'the card this profile fits reads STAT4')

  m.assert((await m.peek(HW_PRESENT)) & HW_VID, 'HW_VID is clear on a machine with a PICOVDP')
  m.assertByte(await m.peek(VDP_FW), info.status[5], 'VDP_FW against the card\'s STAT5')
  m.assertByte(await m.peek(VDP_CAPS), info.status[6], 'VDP_CAPS against the card\'s STAT6')
  m.assert((await m.peek(VDP_FW)) !== 0, 'VDP_FW is zero, so the probe recorded nothing')

  // And again from a fresh probe, so the select being 0 is the probe's doing
  // rather than the reset value surviving a boot that never probed.
  await m.call6502(0xa078) // KernalInit
  m.assertByte((await m.videoRegisters())[STATSEL_A], 0, 'STATSEL_A after KernalInit')
  m.assertByte(await m.peek(VDP_FW), info.status[5], 'VDP_FW after a second probe')
  m.assertByte(await m.peek(VDP_CAPS), info.status[6], 'VDP_CAPS after a second probe')
}
