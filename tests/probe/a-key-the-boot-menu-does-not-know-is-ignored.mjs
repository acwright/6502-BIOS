// The boot menu offers two keys. README step 9 names ENTER and ESC and nothing
// else, so anything else has to be swallowed and the countdown has to continue.
//
// The failure this guards against is the plausible one: a menu that treats any
// key as "the user is there, stop waiting" and boots BASIC early, which would
// mean a stray byte on the serial line — a terminal's handshake, a fat finger —
// silently robbing the user of the ESC they were reaching for.
//
// So the assertion is that the machine still spends its five seconds. The key
// is consumed, and the wait it was not allowed to interrupt still happens.

import { coldBoot, MENU_CYCLES, BASIC_READY } from '../lib/boot.mjs'

export const name = 'a key that is not on the boot menu is swallowed and the countdown continues'

export async function run(m) {
  const boot = await coldBoot(m, { key: 'Z', expect: BASIC_READY })

  m.assert(
    boot.cycles > MENU_CYCLES * 0.8,
    `a stray "Z" cut the boot short at ${boot.cycles} cycles, against the ` +
      `${MENU_CYCLES} the menu should still have waited — an unknown key is ` +
      'being treated as an answer to the menu',
  )

  // And it was consumed by the menu rather than left in the buffer for BASIC,
  // which would make the first thing the user typed a syntax error.
  m.assertNoMatch(boot.output, /SYNTAX ERROR/, 'the swallowed key must not reach BASIC')
}
