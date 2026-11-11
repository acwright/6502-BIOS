// BIOS plan B4. A real CF card starts up with the machine and stays busy for
// hundreds of milliseconds: three measured on a KIM took 426 to 545 ms and
// answered $80 throughout. The old probe gave up at 0.85 s, and at 2 MHz at
// half that, which missed all three. This one waits up to 3.0 s, so a card as
// slow as the slowest measured is found, and the probe says how long it took.
//
// The card here is busy for 545 ms after the reset (--cf-busy). The probe
// starts a few milliseconds after the reset, once the boot has reached it, so
// CF_PROBE_POLLS is a little under 5,450: about 5,444 on 2.x and 5,391 on
// 1.x, whose boot reaches the probe later.
export const name = 'the CF probe finds a card as slow as a real one, and says how long it took'
export const profile = 'cf-slow'

const HW_PRESENT = 0x030d
const HW_CF = 0x08
const CF_PROBE_POLLS = 0x0376
const CF_PROBE_STAT = 0x0378
const BUSY = 0x80

export async function run(m) {
  m.assertEqual((await m.peek(HW_PRESENT) & HW_CF) !== 0, true, 'HW_CF with a card that takes 545 ms to start')
  const polls = (await m.peek(CF_PROBE_POLLS)) | ((await m.peek(CF_PROBE_POLLS + 1)) << 8)
  m.assertEqual(polls >= 5300 && polls < 5450, true, `CF_PROBE_POLLS ${polls}: 545 ms less the boot before the probe`)
  m.assertByte(await m.peek(CF_PROBE_STAT), BUSY, 'CF_PROBE_STAT: a busy card answers BSY alone')
}
