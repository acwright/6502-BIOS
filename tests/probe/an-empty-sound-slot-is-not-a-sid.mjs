// BIOS plan B1. An empty slot reads open bus, the last byte on the data bus:
// for SID_OSC3 ($981B), the address's high byte, $98. The probe used to read
// voice 3 once and accept anything but $00 or $FF, so every machine without a
// Sound Card set HW_SID and ran the SID setup into an empty window (a real KIM
// read HW_PRESENT $50 with the slot empty, 2026-11-03). Now a SID has to change
// between reads.
//
// This fails without the fix only on an emulator that models open bus
// (6502-EMULATOR after 3.5.0). On one that reads an empty slot as $00, the old
// probe rejected the $00 and the case passes either way.
export const name = 'an empty sound slot is not a SID, though it reads open bus'
export const profile = 'no-sound'

const HW_PRESENT = 0x030d
const HW_SID = 0x40

export async function run(m) {
  const present = await m.peek(HW_PRESENT)
  m.assertEqual((present & HW_SID) !== 0, false, `HW_SID with the sound slot empty (HW_PRESENT $${present.toString(16)})`)
}
