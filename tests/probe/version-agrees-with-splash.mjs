// The one test that guards the release process itself.
//
// Bumping the BIOS version means two edits that must stay in step:
//
//   BIOS.inc      BIOS_VERSION_MAJOR / BIOS_VERSION_MINOR, which is what
//                 KernalVersion ($A07B) reports to a program
//   Kernal.asm    the hardcoded "-- 6502 BIOS v1.3 --" splash string
//
// They can drift, and nothing else in the suite would notice: the splash is a
// string nobody parses and the Kernal call is a number nobody reads. So assert
// they agree, and a half-finished version bump fails the build.

export const name = 'the splash version and KernalVersion agree'

const KERNAL_VERSION = 0xa07b
const SPLASH_PREFIX = '-- 6502 BIOS v'

export async function run(m) {
  // Through the published jump slot, not the implementation behind it. The
  // address is the contract, so it is what the call goes through; the symbol is
  // a cross-check, and only when the ROM under test came with symbols — a
  // `--rom` pointed at an older build has none.
  if ((await m.info()).symbols > 0) {
    m.assertWord(await m.resolve('KernalVersion'), KERNAL_VERSION, 'the KernalVersion symbol')
  }

  const regs = await m.call6502(KERNAL_VERSION)
  const reported = `${regs.A}.${regs.X}`

  const rom = await m.read(0x0000, 0x8000, 'rom')
  const text = Buffer.from(rom).toString('latin1')
  const at = text.indexOf(SPLASH_PREFIX)
  m.assert(at >= 0, `the splash string ${JSON.stringify(SPLASH_PREFIX)} is not in the ROM`)

  const splash = text.slice(at, text.indexOf('\0', at))
  const match = /^-- 6502 BIOS v(\d+)\.(\d+) --$/.exec(splash)
  m.assert(match, `the splash string is malformed: ${JSON.stringify(splash)}`)

  m.assertEqual(
    `${match[1]}.${match[2]}`,
    reported,
    `splash says v${match[1]}.${match[2]}, KernalVersion says v${reported} — ` +
      'BIOS.inc and Kernal.asm have drifted',
  )
}
