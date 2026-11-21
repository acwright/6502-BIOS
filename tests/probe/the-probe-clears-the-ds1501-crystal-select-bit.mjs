// A DS1501 in the DS1511Y's place must keep time with the 6 pF crystal it is
// fitted with.
//
// The DS1501 is the chip inside the DS1511Y module, without its crystal and
// cell. Control B's bit 6, CS (Crystal Select), sets its oscillator's load: 0 for
// a 6 pF crystal, 1 for a 12.5 pF one. Like TE and BME beside it, CS is
// battery-backed and the datasheet leaves it undefined at power-up, so a new chip
// can arrive with it set and run its clock slow. On the DS1511Y module CS should
// be 0 too, so clearing it is right for both.
//
// Every other write the BIOS makes to Control B is a read-modify-write of one
// bit, so only the boot probe can clear CS. Issue #4: it didn't. The assertion
// is that CS reads 0 after a cold boot that started with it set, and that the
// probe's other work still happened: the card is found and TE is set.

import { coldBoot, BASIC_READY } from '../lib/boot.mjs'

export const name = 'the probe clears a DS1501\'s Crystal Select bit'

const HW_PRESENT = 0x030d
const HW_RTC = 0x04
const RTC_CTRL_B = 0x880f
const TE = 0x80
const CS = 0x40

export async function run(m) {
  await m.write(RTC_CTRL_B, TE | CS)
  m.assertByte(await m.peek(RTC_CTRL_B), TE | CS, 'Control B before the reset — CS did not take')

  await coldBoot(m, { expect: BASIC_READY })

  const present = await m.peek(HW_PRESENT)
  m.assert(
    (present & HW_RTC) === HW_RTC,
    `HW_PRESENT is $${present.toString(16).padStart(2, '0')} — the probe lost the clock card`,
  )

  const controlB = await m.peek(RTC_CTRL_B)
  m.assertEqual(controlB & CS, 0, `CS after the probe (Control B = $${controlB.toString(16)})`)
  m.assertEqual(controlB & TE, TE, `TE after the probe (Control B = $${controlB.toString(16)})`)
}
