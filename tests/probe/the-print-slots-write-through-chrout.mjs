// The three printing slots, called the way a cartridge calls them: through the
// $A000 address, with the arguments the README documents, and read back off the
// console they claim to write to.
//
//   $A090  PrintStr      "Print a NUL-terminated string via Chrout: A=lo, Y=hi"
//   $A093  PrintCRLF     "Print CR+LF via Chrout"
//   $A096  PrintDecU16   "Print an unsigned 16-bit value as decimal, no
//                         leading zeros: A=lo, X=hi"
//
// "No leading zeros" and "unsigned" are the two claims worth pushing on.
// PrintDecU16 is what the Monitor and `MEM` count with, and the values that
// break a decimal printer are the ones at the ends: 0, which has nothing but a
// leading zero, and 65535, which is negative if anybody treated it as signed.

import { stripCR } from '../lib/machine.mjs'

export const name = 'PrintStr, PrintCRLF and PrintDecU16 write through Chrout'

const PrintStr = 0xa090
const PrintCRLF = 0xa093
const PrintDecU16 = 0xa096

// Free RAM, clear of call6502's stub at $7F00.
const TEXT = 0x7e00

// Call a slot and hand back everything it printed.
async function printed(m, address, registers) {
  const { cursor } = await m.serialRead(0)
  await m.call6502(address, registers)
  return stripCR((await m.serialRead(cursor)).data ?? '')
}

export async function run(m) {
  // PrintStr — the string is the caller's, in the caller's RAM.
  await m.write(TEXT, [...Buffer.from('HELLO', 'latin1'), 0x00])
  m.assertEqual(
    await printed(m, PrintStr, { A: TEXT & 0xff, Y: TEXT >> 8 }),
    'HELLO',
    'PrintStr prints the string and stops at the NUL',
  )

  m.assertEqual(await printed(m, PrintCRLF, {}), '\n', 'PrintCRLF prints one line ending')

  for (const value of [0, 1, 9, 10, 255, 1000, 32768, 65535]) {
    m.assertEqual(
      await printed(m, PrintDecU16, { A: value & 0xff, X: value >> 8 }),
      String(value),
      `PrintDecU16 of ${value}`,
    )
  }
}
