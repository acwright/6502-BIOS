// BIOS plan B4. The probe waits up to CF_PROBE_LIMIT polls of 100 cycles,
// 3.0 s at 1 MHz, for a card to come ready, and only a card that never does
// waits it out. The card here stays busy for 4 s after the reset
// (--cf-busy), so the probe gives up: HW_CF stays clear, CF_PROBE_POLLS is the
// limit, and CF_PROBE_STAT is the card's $80, not the $8C of an empty slot,
// which is how the two are told apart afterwards.
export const name = 'the CF probe gives up on a card that never comes ready, after 3.0 s'
export const profile = 'cf-dead'

const HW_PRESENT = 0x030d
const HW_CF = 0x08
const CF_PROBE_POLLS = 0x0376
const CF_PROBE_STAT = 0x0378
const CF_PROBE_LIMIT = 30000
const BUSY = 0x80

export async function run(m) {
  m.assertEqual((await m.peek(HW_PRESENT) & HW_CF) !== 0, false, 'HW_CF with a card still busy at the limit')
  const polls = (await m.peek(CF_PROBE_POLLS)) | ((await m.peek(CF_PROBE_POLLS + 1)) << 8)
  m.assertEqual(polls, CF_PROBE_LIMIT, 'CF_PROBE_POLLS for a card that never came ready')
  m.assertByte(await m.peek(CF_PROBE_STAT), BUSY, 'CF_PROBE_STAT: the card, busy, not open bus')
}
