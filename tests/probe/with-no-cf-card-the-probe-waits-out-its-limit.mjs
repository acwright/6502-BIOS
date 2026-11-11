// BIOS plan B4, step 1. With the CF slot empty, nothing ever says ready, so the
// probe waits its whole limit, CF_PROBE_LIMIT polls of 100 cycles: 8,520, the
// 0.85 s at 1 MHz it waited before B4. CF_PROBE_POLLS says so, and HW_CF stays
// clear. CF_PROBE_STAT is not asserted: it is open bus, $8C on an emulator that
// models it and $00 on one that does not.
export const name = 'with no CF card, the probe waits out its limit and says so'
export const profile = 'no-cf'

const HW_PRESENT = 0x030d
const HW_CF = 0x08
const CF_PROBE_POLLS = 0x0376
const CF_PROBE_LIMIT = 8520

export async function run(m) {
  m.assertEqual((await m.peek(HW_PRESENT) & HW_CF) !== 0, false, 'HW_CF with the CF slot empty')
  const polls = (await m.peek(CF_PROBE_POLLS)) | ((await m.peek(CF_PROBE_POLLS + 1)) << 8)
  m.assertEqual(polls, CF_PROBE_LIMIT, 'CF_PROBE_POLLS with the CF slot empty')
}
