// `BOOT_VECTOR` ($035B-$035C) — boot step 6, and the cartridge facility the
// README's "What Cartridges Can Rely On" section is built around.
//
// Two claims, and the second one only exists because of the first.
//
// `KernalInit` zeroes `BOOT_VECTOR`, which the README says outright, so the
// window in which a cartridge can set it is between `KernalInit` returning and
// `Reset` reading it. That window is exactly one instruction wide in the source
// — `jsr Beep` sits in it — which is why this case breaks on `Beep` rather than
// writing the vector from the prompt and resetting. A write made any earlier is
// erased by the init that follows it, and a case that did it that way would be
// asserting something no cartridge could ever do.
//
// The redirect target needs no code planted at it: an execution breakpoint
// stops the machine *before* the instruction there, so arriving is the whole
// assertion and whatever bytes happen to be at the address are never run.

export const name = 'a boot vector set after KernalInit takes over from the splash'

const BOOT_VECTOR = 0x035b
const CF_DISK = 0x030f
const BEEP = 0xa030 // the jump slot Reset calls between KernalInit and the check
const TARGET = 0x7000 // free RAM, well above anything the boot touches

export async function run(m) {
  const { cursor } = await m.serialRead(0)
  await m.clearBreaks()
  await m.breakAt(BEEP)

  await m.reset(true)
  const arrived = await m.waitFor({ stopped: true, run: 'turbo', timeoutMs: 60000 })
  m.assert(arrived.matched, 'the machine never reached Beep — KernalInit did not return')

  // Boot step 6 has not happened yet, and this is what KernalInit left behind.
  m.assertWord(await m.peekWord(BOOT_VECTOR), 0x0000, 'BOOT_VECTOR after KernalInit')
  // Boot step 2 is over, so the disk bank is set: "resets to 0 on power-on".
  m.assertByte(await m.peek(CF_DISK), 0x00, 'CF_DISK after KernalInit')

  // Now be the cartridge.
  await m.write(BOOT_VECTOR, [TARGET & 0xff, TARGET >> 8])
  await m.clearBreaks()
  await m.breakAt(TARGET)

  const redirected = await m.waitFor({ stopped: true, run: 'turbo', timeoutMs: 60000 })
  await m.clearBreaks()
  m.assert(
    redirected.matched,
    'the machine never reached the boot vector — it carried on to the splash and ' +
      'the boot menu instead of honouring BOOT_VECTOR',
  )
  m.assertEqual(redirected.stop?.kind, 'breakpoint', 'the stop')
  m.assertWord(redirected.stop?.address, TARGET, 'where the boot went')

  // And it took over *instead of* booting, rather than as well as.
  const printed = (await m.serialRead(cursor)).data ?? ''
  m.assertNoMatch(printed, /6502 BASIC/, 'BASIC must not start when a boot vector is set')
  m.assertNoMatch(printed, /6502 MONITOR/, 'the Monitor must not start when a boot vector is set')
}
