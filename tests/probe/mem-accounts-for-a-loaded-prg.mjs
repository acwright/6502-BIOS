// MEM reports MEMSIZ - VARTAB, so it is the user-visible face of the same
// pointer a `.prg` load has to get right. If VARTAB stopped at the BASIC
// line's chain terminator, MEM would report the machine code as free memory —
// which is exactly what it would then be handed out as.
export const name = 'MEM accounts for a loaded .prg in full, machine code included'
export const profile = 'cf'

// README: "LOAD and SAVE round-trip a .prg intact, machine code included, and
//          MEM accounts for the whole thing"
//         "MEM — Print free bytes, HW=$xx, and DISK n"

import { describeFixtures } from '../fixtures/build.mjs'

const PROGRAM_START = 0x0800
const BAS_VARTAB = 0x035f
const BAS_MEMSIZ = 0x0367

const prg = describeFixtures().file('SAMPLE.PRG')

const freeBytes = (text) => {
  const match = /^\s*(\d+) BYTES FREE/m.exec(text)
  if (!match) throw new Error(`no free-byte figure in MEM output: ${JSON.stringify(text)}`)
  return Number(match[1])
}

export async function run(m) {
  const memsiz = await m.peekWord(BAS_MEMSIZ)
  const empty = freeBytes((await m.send('MEM\r', /^OK/)).output)
  m.assertEqual(empty, memsiz - (await m.peekWord(BAS_VARTAB)), 'MEM on an empty machine')

  await m.send('LOAD "SAMPLE.PRG"\r', /^OK/)
  const loaded = freeBytes((await m.send('MEM\r', /^OK/)).output)

  // The whole image is spent, not just the BASIC line: 35 bytes of file
  // against the 2 an empty program occupies.
  m.assertEqual(loaded, memsiz - (PROGRAM_START + prg.size), 'MEM with the .prg loaded')
  m.assertEqual(empty - loaded, prg.size - 2, 'what the .prg cost')
}
