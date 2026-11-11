// BIOS plan B4. With the CF slot empty, HW_CF stays clear, and what the probe
// waited depends on what the empty slot reads.
//
// On an emulator that models open bus (6502-EMULATOR after 3.5.0), as on the
// board, the status register reads $8C and its copy at $8F07 reads $8F, each
// address's high byte. The probe recognises that in two reads and waits
// nothing: CF_PROBE_POLLS is 0 and CF_PROBE_STAT $8C.
//
// On one that reads an empty slot as $00, nothing is recognised and nothing
// ever says ready, so the probe waits its whole limit, CF_PROBE_LIMIT polls of
// 100 cycles (3.0 s at 1 MHz).
export const name = 'with no CF card, the probe skips an empty slot, or waits out its limit'
export const profile = 'no-cf'

const HW_PRESENT = 0x030d
const HW_CF = 0x08
const CF_PROBE_POLLS = 0x0376
const CF_PROBE_STAT = 0x0378
const CF_PROBE_LIMIT = 30000
const OPEN_BUS = 0x8c

export async function run(m) {
  m.assertEqual((await m.peek(HW_PRESENT) & HW_CF) !== 0, false, 'HW_CF with the CF slot empty')
  const polls = (await m.peek(CF_PROBE_POLLS)) | ((await m.peek(CF_PROBE_POLLS + 1)) << 8)
  const stat = await m.peek(CF_PROBE_STAT)
  if (stat === OPEN_BUS) {
    m.assertEqual(polls, 0, 'CF_PROBE_POLLS with the slot recognised as empty (open bus)')
  } else {
    m.assertEqual(polls, CF_PROBE_LIMIT, `CF_PROBE_POLLS with an empty slot reading $${stat.toString(16)}, not open bus`)
  }
}
