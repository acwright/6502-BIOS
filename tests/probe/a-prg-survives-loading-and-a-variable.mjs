// The regression pinned by 73273b6, from the side a user meets it: LOAD a
// `.prg`, assign a variable, and the machine code behind the BASIC line is
// still there.
//
// A `.prg` is a program with machine code attached past the end of its chain.
// Nothing in the text says how long the image is, so a LOAD that set VARTAB
// from the chain terminator alone leaves the first variable to be allocated
// straight over the code — which still LISTs and still RUNs, right up until
// something assigns.
export const name = 'a .prg loaded from CF survives assigning a variable'
export const profile = 'cf'

// README: "LOAD and SAVE round-trip a .prg intact, machine code included"
//         "A .prg is one of these whose BASIC part is a single 10 SYS 2060
//          line with machine code attached behind it"

import { describeFixtures } from '../fixtures/build.mjs'

const PROGRAM_START = 0x0800
const BAS_VARTAB = 0x035f

const fixtures = describeFixtures()
const prg = fixtures.file('SAMPLE.PRG')

export async function run(m) {
  await m.send('LOAD "SAMPLE.PRG"\r', /^OK/)

  // The whole image, machine code included, exactly as the card holds it.
  m.assertBytes(await m.read(PROGRAM_START, prg.size), prg.bytes, 'the loaded image')
  m.assertWord(await m.peekWord(BAS_VARTAB), PROGRAM_START + prg.size, 'VARTAB after LOAD')

  // The assignment that used to land on top of the code.
  await m.send('A = 1\r', /^OK/)
  m.assertBytes(await m.read(PROGRAM_START, prg.size), prg.bytes, 'the image after a variable')

  // And it still does what it was built to do: line 10 is SYS 2060, and 2060
  // is where the code sits.
  const { output } = await m.send('RUN\r', /^OK/)
  m.assertMatch(output, /^PRG OK$/m, 'what the machine code printed')
}
