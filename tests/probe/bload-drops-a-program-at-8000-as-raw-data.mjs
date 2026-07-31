// The README makes a specific promise about BLOAD and a `.bas` file, and it is
// the one that proves the command, not the filename, decides what a file is:
// "BLOAD 32768,"GUESS.BAS" will happily drop a BASIC program at $8000 as raw
// data". Same file, a different command, and nothing about it is interpreted.
export const name = 'BLOAD drops a .bas file at $8000 as raw data, program running'
export const profile = 'cf'

// README: "Both accept any filename, so BLOAD 32768,"GUESS.BAS" will happily
//          drop a BASIC program at $8000 as raw data"
//         "making it straightforward to load game maps, graphics, or data files
//          while a program is running"

import { describeFixtures } from '../fixtures/build.mjs'

const BANK_RAM = 0x8000
const BAS_VARTAB = 0x035f

const hello = describeFixtures().file('HELLO.BAS')

export async function run(m) {
  // A program in memory first, so the "while a program is running" half is
  // real: the BLOAD must not disturb the text or the pointers behind it.
  await m.send('10 PRINT "STILL HERE"\r', 'PRINT')
  const vartab = await m.peekWord(BAS_VARTAB)

  await m.send(`BLOAD ${BANK_RAM},"HELLO.BAS"\r`, /^OK/)

  m.assertBytes(await m.read(BANK_RAM, hello.size), hello.bytes, 'the file, as raw bytes')
  m.assertWord(await m.peekWord(BAS_VARTAB), vartab, 'VARTAB across a BLOAD')

  const { output } = await m.send('RUN\r', /^OK/)
  m.assertMatch(output, /^STILL HERE$/m, 'the program that was already there')
}
