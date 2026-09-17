// VDP-PLAN §4.1 and §5 Phase 8: `HW_VID` means a PICOVDP **with the built-in
// font**, because the ROM has no character set of its own to fall back on. A
// card that answers `STAT4` = `$AC` but lacks `STAT6` b7 is not video.
//
// The emulator's card cannot be made to report that: `STAT6` is a constant
// `$BF` and `video.setRegister` reaches registers, not status. So the case
// stops the probe on the instruction that records `STAT6` and clears b7 in A,
// which is exactly what such a card's read would have handed the Kernal. What
// is tested is the Kernal's decision, not the card (FINDINGS.md).

export const name = 'a PICOVDP without the built-in font is not taken as a console'
export const profile = 'video'

const KernalInit = 0xa078
const HW_PRESENT = 0x030d
const HW_VID = 0x80
const VDP_CAPS = 0x0395
const VDP_CAPS_OPERAND = [0x8d, VDP_CAPS & 0xff, VDP_CAPS >> 8] // sta VDP_CAPS

export async function run(m) {
  // The one `sta VDP_CAPS` in ProbeVideo, found in the ROM rather than hard-coded.
  const probe = await m.resolve('ProbeVideo')
  const code = await m.read(probe, 64)
  let offset = -1
  for (let i = 0; i + 3 <= code.length; i++) {
    if (VDP_CAPS_OPERAND.every((b, j) => code[i + j] === b) && i > 4) offset = i
  }
  m.assert(offset > 0, 'no sta VDP_CAPS after the STAT6 read in ProbeVideo')
  const record = probe + offset

  // The real card first, through the same breakpoint, so the injection below is
  // the only difference.
  for (const withFont of [true, false]) {
    const what = withFont ? 'STAT6 = $BF' : 'STAT6 b7 cleared'
    const returnTo = await m.plantCall(KernalInit)
    const { id } = await m.breakAt(record)
    const stop = await m.runTo(returnTo, 10000)
    m.assertEqual(stop.stop?.kind, 'breakpoint', `${what}: the probe never recorded STAT6`)
    const regs = await m.regs()
    m.assertEqual(regs.PC, record, `${what}: stopped somewhere else`)
    m.assertByte(regs.A, 0xbf, `${what}: STAT6 as the probe read it`)
    if (!withFont) await m.setRegs({ A: regs.A & 0x7f })
    await m.clearBreaks(id)
    const done = await m.runTo(returnTo, 10000)
    m.assertEqual(done.stop?.kind, 'breakpoint', `${what}: KernalInit did not return`)

    const hw = await m.peek(HW_PRESENT)
    if (withFont) {
      m.assert(hw & HW_VID, `${what}: HW_VID clear`)
    } else {
      m.assertEqual(hw & HW_VID, 0, `${what}: HW_VID set`)
      m.assertByte(await m.peek(VDP_CAPS), 0x3f, `${what}: VDP_CAPS`)
    }
  }
}
