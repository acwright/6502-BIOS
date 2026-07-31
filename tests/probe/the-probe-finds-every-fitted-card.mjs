// The hardware probe, bit by bit, against the README's table.
//
// `HW_PRESENT` ($030D) is the machine's own answer to "what am I made of", and
// every degradation path in the BIOS is a branch on one of its bits. Asserting
// the byte as a whole would say "the probe worked"; asserting each bit by name
// says which card the probe lost, which is the thing you need to know.
//
// The headless emulator fits everything except a video card, so a serial
// machine's honest answer is $7F. Its companion case,
// a-video-card-is-probed-and-becomes-the-console, covers the other bit and the
// other console.

export const name = 'the hardware probe finds every fitted card and picks the serial console'

const HW_PRESENT = 0x030d
const IO_MODE = 0x0306

// README § Hardware Presence Flags. Bit order matches the IO slot numbers.
export const CARDS = [
  [0x01, 'RAM card low (IO 1)'],
  [0x02, 'RAM card high (IO 2)'],
  [0x04, 'RTC DS1511Y (IO 3)'],
  [0x08, 'CompactFlash (IO 4)'],
  [0x10, 'Serial R65C51 (IO 5)'],
  [0x20, 'GPIO/VIA 65C22 (IO 6)'],
  [0x40, 'SID/ARMSID (IO 7)'],
  [0x80, 'Video TMS9918 (IO 8)'],
]

export const IO_MODE_VIDEO = 0
export const IO_MODE_SERIAL = 1

// Assert each bit by name, so a failure names the card rather than a number.
export function assertCards(m, present, fitted) {
  for (const [mask, card] of CARDS) {
    const want = (fitted & mask) !== 0
    m.assertEqual(
      (present & mask) !== 0,
      want,
      `${card} — HW_PRESENT bit ${Math.log2(mask)} says ${(present & mask) !== 0 ? 'fitted' : 'absent'}`,
    )
  }
}

export async function run(m) {
  const present = await m.peek(HW_PRESENT)
  assertCards(m, present, 0x7f)

  // Step 4 of the boot sequence: no video card, so the console is the serial
  // port. This is the derived half of the probe — every card above is found
  // independently, and IO_MODE is the one conclusion drawn from them.
  m.assertByte(await m.peek(IO_MODE), IO_MODE_SERIAL, 'IO_MODE with no video card fitted')
}
