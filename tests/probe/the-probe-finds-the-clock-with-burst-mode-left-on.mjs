// The clock card has to be found whatever state earlier software left it in.
//
// Control B's BME bit (bit 5, Burst Mode Enable) makes the DS1511Y advance its
// NVRAM address latch on every access of the data port, $8813. Like TE beside
// it, BME is battery-backed and the datasheet leaves it undefined at power-up,
// so a board can arrive at reset with it set — left there by a game that saved
// in burst mode, or by nothing at all.
//
// The probe sets the address once and then touches the data port three times:
// save, write the pattern, read it back. With BME set each access walks the
// latch on, so the read-back compares against a different byte from the one
// written, `HW_RTC` is never set, and the machine reports no clock card on a
// board that has one. The restore then lands on a third address, scribbling the
// saved value over a byte the probe never meant to touch. Both are silent.
//
// So the assertion is on all three: the card is found, the NVRAM around the
// probe's scratch byte is unchanged, and BME is clear afterwards so that the
// single-byte RtcReadNVRAM / RtcWriteNVRAM pair behaves as documented.

import { coldBoot, BASIC_READY } from '../lib/boot.mjs'

export const name = 'the probe finds the clock card when burst mode was left on'

const HW_PRESENT = 0x030d
const HW_RTC = 0x04
const RTC_CTRL_B = 0x880f
const TE = 0x80
const BME = 0x20

// Distinct and unlike anything a probe or blank card would leave, so a byte
// written to the wrong address is visible wherever it lands.
const IMAGE = [0x3c, 0xc3, 0x69, 0x96, 0x5a]

export async function run(m) {
  await m.write(0, IMAGE, 'nvram')
  await m.write(RTC_CTRL_B, TE | BME)
  m.assertByte(await m.peek(RTC_CTRL_B), TE | BME, 'Control B before the reset — BME did not take')

  await coldBoot(m, { expect: BASIC_READY })

  const present = await m.peek(HW_PRESENT)
  m.assert(
    (present & HW_RTC) === HW_RTC,
    `HW_PRESENT is $${present.toString(16).padStart(2, '0')} — the probe lost the clock card with BME set`,
  )

  m.assertBytes(await m.read(0, IMAGE.length, 'nvram'), IMAGE, 'NVRAM around the probe\'s scratch byte')

  const controlB = await m.peek(RTC_CTRL_B)
  m.assertEqual(controlB & BME, 0, `BME after the probe (Control B = $${controlB.toString(16)})`)
  m.assertEqual(controlB & TE, TE, `TE after the probe (Control B = $${controlB.toString(16)})`)
}
