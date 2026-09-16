// The one test that guards the release process itself.
//
// The BIOS version lives in BIOS.inc (BIOS_VERSION_MAJOR / BIOS_VERSION_MINOR),
// and reaches the outside world two ways:
//
//   KernalVersion ($A07B)   what a program reads
//   BASIC's header string   "6502 BIOS v2.0", what a user reads
//
// The header is built from the equates with .sprintf, so today they cannot
// drift. This case is what keeps it that way: a header string typed out by hand
// again, or a second copy left behind somewhere, fails here rather than on the
// next version bump.

export const name = 'the header version and KernalVersion agree'

const KERNAL_VERSION = 0xa07b
const HEADER_PREFIX = '6502 BIOS v'

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
  const at = text.indexOf(HEADER_PREFIX)
  m.assert(at >= 0, `the header string ${JSON.stringify(HEADER_PREFIX)} is not in the ROM`)
  m.assertEqual(text.indexOf(HEADER_PREFIX, at + 1), -1, 'a second copy of the header string in the ROM')

  const header = text.slice(at, text.indexOf('\0', at))
  const match = /^6502 BIOS v(\d+)\.(\d+)$/.exec(header)
  m.assert(match, `the header string is malformed: ${JSON.stringify(header)}`)

  m.assertEqual(
    `${match[1]}.${match[2]}`,
    reported,
    `the header says v${match[1]}.${match[2]}, KernalVersion says v${reported} — ` +
      'the header and BIOS.inc have drifted',
  )
}
