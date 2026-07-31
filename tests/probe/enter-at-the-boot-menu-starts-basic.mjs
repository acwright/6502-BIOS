// README boot step 9: "**ENTER** (or timeout) — launches the BASIC interpreter".
//
// The output on its own cannot tell this case from the timeout case — both end
// at the same BASIC banner. What makes ENTER a distinct promise is that it does
// not wait: the menu is answered and the machine moves on. So the assertion is
// on the emulated cycles, and its companion case,
// the-boot-menu-times-out-into-basic, holds the other side of the same line.

import { coldBoot, MENU_CYCLES, BASIC_BANNER, BASIC_READY } from '../lib/boot.mjs'

export const name = 'ENTER at the boot menu starts BASIC without waiting out the timeout'

export async function run(m) {
  const boot = await coldBoot(m, { key: '\r', expect: BASIC_READY })

  m.assertMatch(boot.output, BASIC_BANNER, 'the BASIC banner after ENTER')
  m.assert(
    boot.cycles < MENU_CYCLES / 2,
    `ENTER took ${boot.cycles} cycles to reach BASIC, which is most of the ` +
      `${MENU_CYCLES}-cycle menu timeout — the keypress is not being seen, and ` +
      'the machine is timing out into BASIC instead of being sent there',
  )
}
