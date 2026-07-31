// The README's second route to a `.prg`: the Monitor's L at its default
// address, then X back to BASIC. The hand-off is the interesting part — the
// Monitor has to tell BASIC how long the image was, or the first variable
// assignment lands on the machine code exactly as it did before 73273b6.
export const name = "the Monitor's L loads a .prg and X hands it to BASIC intact"
export const profile = 'cf'
export const mode = 'monitor'

// README: "Load them with LOAD. The Monitor's L also works, as long as you take
//          its default $0800 address and then X back to BASIC. A Wozmon upload
//          does not — it has no way to tell BASIC how long the image is, so the
//          machine code is lost as soon as you assign a variable"
//         "L "file" [addr] — Load from CompactFlash ... to address (default
//          $0800). Loading at the default address lets X hand the program
//          straight to BASIC, ready to RUN"

import { describeFixtures } from '../fixtures/build.mjs'

const PROGRAM_START = 0x0800
const BAS_VARTAB = 0x035f

const prg = describeFixtures().file('SAMPLE.PRG')

export async function run(m) {
  const { output } = await m.send('L "SAMPLE.PRG"\r', /^\. /)
  m.assertMatch(output, new RegExp(`^LOADED ${prg.size} BYTES AT \\$0800$`, 'm'), 'the load report')
  m.assertBytes(await m.read(PROGRAM_START, prg.size), prg.bytes, 'the loaded image')

  await m.send('X\r', /^OK/)
  m.assertWord(await m.peekWord(BAS_VARTAB), PROGRAM_START + prg.size, 'VARTAB after X')

  await m.send('A = 1\r', /^OK/)
  m.assertBytes(await m.read(PROGRAM_START, prg.size), prg.bytes, 'the image after a variable')

  const run = await m.send('RUN\r', /^OK/)
  m.assertMatch(run.output, /^PRG OK$/m, 'what the machine code printed')
}
