// README boot step 9: "waits ~5 seconds for a keypress, then auto-boots BASIC".
//
// A machine that never showed the menu at all would also reach BASIC, so
// reaching it proves nothing on its own. What is being asserted is that the
// wait happened — that the user had their five seconds — and the only witness
// to that is the emulated cycle count.
//
// The band is deliberately wide. The claim is "~5 seconds", the menu spends its
// time in SysDelay against the VIA's timer, and the probe and beep before it
// cost a few hundred thousand cycles more. A band this wide still catches the
// two failures that matter: a menu that does not wait, and a menu that never
// gives up.

import { coldBoot, MENU_CYCLES, BASIC_BANNER, BASIC_READY } from '../lib/boot.mjs'

export const name = 'the boot menu waits about five seconds and then starts BASIC'

export async function run(m) {
  const boot = await coldBoot(m, { expect: BASIC_READY })

  m.assertMatch(boot.output, BASIC_BANNER, 'the BASIC banner after the menu timed out')
  m.assert(
    boot.cycles > MENU_CYCLES * 0.8,
    `the machine reached BASIC in ${boot.cycles} cycles, well under the ` +
      `${MENU_CYCLES} the ~5-second menu should take — it is not waiting for a key`,
  )
  m.assert(
    boot.cycles < MENU_CYCLES * 2,
    `the machine took ${boot.cycles} cycles to reach BASIC, far past the ` +
      `${MENU_CYCLES}-cycle timeout — the menu is waiting longer than it promises`,
  )
}
