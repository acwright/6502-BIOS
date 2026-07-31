// The other half of the probe: a machine with a video card fitted.
//
// Two claims, and they are separate ones. The probe has to *find* the card
// (README § Hardware Presence Flags, bit 7), and the console auto-detection has
// to *prefer* it — boot step 4 says video wins over serial when both are
// present, which is exactly this machine.

import { assertCards, IO_MODE_VIDEO } from './the-probe-finds-every-fitted-card.mjs'

export const name = 'a video card is probed and takes the console from serial'
export const profile = 'video'

const HW_PRESENT = 0x030d
const IO_MODE = 0x0306

export async function run(m) {
  assertCards(m, await m.peek(HW_PRESENT), 0xff)

  // Serial is fitted here too, and loses. That is the whole point of the case:
  // asserting IO_MODE on a machine with only one console would pass whatever
  // the precedence rule was.
  m.assertByte(await m.peek(IO_MODE), IO_MODE_VIDEO, 'IO_MODE with both consoles fitted')
}
