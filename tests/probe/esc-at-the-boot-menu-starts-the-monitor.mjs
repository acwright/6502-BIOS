// README boot step 9: "**ESC** — drops into the machine-code monitor".
//
// This case asserts what the code does, which is more than the README used to
// promise: `@BootMonitor` (Kernal.asm) enters through a `brk` rather than
// jumping to the Monitor's entry point, so the user gets the banner *and* the
// `BRK AT $xxxx` line and the register display. That is deliberate and useful —
// entering the Monitor with the machine's state on screen is better than
// entering it blind — so the triage (PLAN.md §10.1) is a doc bug: the code is
// right and the README sentence was stale. It now says what happens.
//
// Asserting the fuller output rather than just the banner is the point. A regex
// that only looked for `6502 MONITOR` would keep passing if the BRK entry were
// replaced by a plain jump, which is a real change to what the user sees.

import { coldBoot, MENU_CYCLES, MONITOR_BANNER, MONITOR_READY } from '../lib/boot.mjs'

export const name = 'ESC at the boot menu starts the Monitor, through a BRK'

export async function run(m) {
  const boot = await coldBoot(m, { key: '\x1b', expect: MONITOR_READY })

  // The whole entry, in the order the user sees it.
  m.assertMatch(boot.output, MONITOR_BANNER, 'the Monitor banner')
  m.assertMatch(boot.output, /^BRK AT \$[0-9A-F]{4}$/m, 'the BRK location')
  m.assertNoMatch(boot.output, /^6502 BASIC/m, 'ESC must not fall through to BASIC')

  m.assert(
    boot.cycles < MENU_CYCLES / 2,
    `ESC took ${boot.cycles} cycles, most of the ${MENU_CYCLES}-cycle menu — ` +
      'the keypress is not being seen at the menu',
  )
}
