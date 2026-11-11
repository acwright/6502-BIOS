// BIOS plan B4, step 1. The boot probe polls the CF status once every 100
// cycles and leaves two diagnostics for a PEEK: CF_PROBE_POLLS ($0376-$0377),
// the polls that found the card not ready, and CF_PROBE_STAT ($0378), the first
// status byte it read. The emulator's card is ready at once.
export const name = 'the CF probe records a ready card: no polls waited, and RDY first'

const HW_PRESENT = 0x030d
const HW_CF = 0x08
const CF_PROBE_POLLS = 0x0376
const CF_PROBE_STAT = 0x0378
const ST_STATUS_BSY = 0x80
const ST_STATUS_RDY = 0x40

export async function run(m) {
  m.assertEqual((await m.peek(HW_PRESENT) & HW_CF) !== 0, true, 'HW_CF with a card fitted')
  const polls = (await m.peek(CF_PROBE_POLLS)) | ((await m.peek(CF_PROBE_POLLS + 1)) << 8)
  m.assertEqual(polls, 0, 'CF_PROBE_POLLS for a card ready at once')
  const stat = await m.peek(CF_PROBE_STAT)
  m.assertEqual(stat & (ST_STATUS_BSY | ST_STATUS_RDY), ST_STATUS_RDY, `CF_PROBE_STAT $${stat.toString(16)}: BSY clear, RDY set`)
}
