// A clock that has been set has to still be a clock.
//
// The DS1511Y's time registers are double buffered, and bit 7 of Control B —
// TE, Transfer Enable — is what joins the two halves: at 1 the internal
// counters are copied into the registers the CPU reads once a second, at 0 that
// copy is inhibited so a program can read or write a consistent set of values.
//
// Every failure mode here is invisible to a read-back test. TE is battery
// backed and nothing inside the part ever clears or sets it, so a driver that
// leaves TE at 0 gets a clock that accepts SETTIME, reports the value back
// perfectly, and then shows that same instant forever — through resets, through
// power cycles, until something happens to set TE again. The counters
// underneath never stopped; only the CPU's view of them did.
//
// So the assertion is on the bit and not only on the symptom. `TIME` twice with
// a pause between catches a stopped clock, but only after waiting for it, and
// only for whatever the pause was long enough to reveal. Reading $880F says
// what state the write actually left the part in.

import { coldBoot, BASIC_READY } from '../lib/boot.mjs'

export const name = 'the clock is left running after SETTIME, not frozen by it'

const RTC_CTRL_B = 0x880f
const TE = 0x80

export async function run(m) {
  const inhibited = async (where) => {
    const controlB = await m.peek(RTC_CTRL_B)
    m.assert(
      (controlB & TE) === TE,
      `Control B is $${controlB.toString(16).padStart(2, '0')} ${where} — ` +
        'TE is clear, so the clock registers are frozen and the time will never advance',
    )
  }

  // The boot probe writes the month register to turn the square wave off, which
  // is a clock write like any other and has to leave the part running too.
  await inhibited('after the boot probe')

  await m.send('SETTIME 4,30,0\r', /^OK/)
  await inhibited('after SETTIME')

  await m.send('SETDATE 20,26,8,4\r', /^OK/)
  await inhibited('after SETDATE')

  // And the bit means what it is being read to mean: three seconds of machine
  // time move the clock on. Anchored to a time set here rather than the boot
  // clock, so this is the state SETTIME left behind and not the one it replaced.
  await m.send('SETTIME 4,30,0\r', /^OK/)
  await m.send('PAUSE 300\r', /^OK/)
  const { output } = await m.send('TIME\r', '^OK')
  m.assertMatch(output, /^04:30:0[3-9]$/m, 'TIME three seconds after it was set')

  // The hardware report that started this: the clock read the same value after a
  // power cycle. A cold boot re-runs the probe, so this covers the probe leaving
  // the part frozen as well as the write doing it.
  await coldBoot(m, { expect: BASIC_READY })
  await inhibited('after a cold boot')
}
