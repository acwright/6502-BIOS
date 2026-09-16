// The reset button restarts BASIC, not the machine's memory.
//
// Once BASIC has run, BAS_WARM holds $A5, and BasEntry with that mark skips
// straight to `OK`. That is right for a BRK or Wozmon's C000R, which come back
// to the program they left. A reset is different: the user pressed it to start
// over, so Reset clears BAS_WARM and BASIC cold-starts — the header prints and
// the variables go — while the program at $0800 is kept, because ProgramEnd
// walks its line chain rather than installing an empty one.
//
// Each half catches its own failure. A reset that left BAS_WARM alone would
// print only `OK` and keep `A`; one that installed an empty program would list
// nothing.

import { coldBoot, BASIC_READY, HEADER } from '../lib/boot.mjs'

export const name = 'a reset shows the header, keeps the program and clears the variables'

const BAS_WARM = 0x036f

export async function run(m) {
  await m.send('10 PRINT "KEPT"\r', /^10 PRINT "KEPT"/)
  await m.send('A = 42\r', /^OK/)
  const { output: before } = await m.send('PRINT A\r', '^OK')
  m.assertMatch(before, /^ 42\s*$/m, 'A before the reset')
  m.assertByte(await m.peek(BAS_WARM), 0xa5, 'BAS_WARM at the prompt')

  // The reset button: RAM is kept.
  const boot = await coldBoot(m, { cold: false, expect: BASIC_READY })
  m.assertMatch(boot.output, HEADER, 'the header after the reset')

  const { output: listed } = await m.send('LIST\r', '^OK')
  m.assertMatch(listed, /^10 PRINT "KEPT"$/m, 'the program after the reset')

  const { output: after } = await m.send('PRINT A\r', '^OK')
  m.assertMatch(after, /^ 0\s*$/m, 'A after the reset')
}
