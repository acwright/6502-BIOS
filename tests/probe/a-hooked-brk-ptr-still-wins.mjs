// VDP-PLAN §4.5: `BRK_PTR` stays hookable. `KernalInit` points it at `Break`,
// and a program (or a cartridge with no BASIC at $C000) that points it
// somewhere else gets the BRK instead of the report.
//
// The hook is a handler that marks memory and returns with RTI, which resumes
// at BRK + 2 — so an RTS there takes the SYS back to BASIC. Reaching `OK` with
// the mark made and no report printed is the whole claim: the Kernal's handler
// never ran.

export const name = 'a program that hooks BRK_PTR gets the BRK, not the report'

const BRK_PTR = 0x0302
const CODE = 0x0900 // BRK $42, RTS
const HANDLER = 0x0a00
const MARK = 0x0b00

export async function run(m) {
  await m.write(CODE, [0x00, 0x42, 0x60])
  await m.write(HANDLER, [
    0xa9, 0x55, // LDA #$55
    0x8d, MARK & 0xff, MARK >> 8, // STA MARK
    0x40, // RTI
  ])
  await m.write(MARK, [0x00])
  await m.write(BRK_PTR, [HANDLER & 0xff, HANDLER >> 8])

  const { cursor } = await m.send('SYS 2304\r', /^OK$/)
  const output = await m.settle(cursor)
  m.assertByte(await m.peek(MARK), 0x55, 'the hooked handler\'s mark')
  m.assert(!/BREAK/.test(output), `the Kernal's report printed anyway:\n${output}`)
}
