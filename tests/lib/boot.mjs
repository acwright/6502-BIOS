// Driving a machine through a reset, for the cases that watch the boot itself.
//
// Every other case in the suite starts from the snapshot taken at the `OK`
// prompt, which is boot already over. These start from a reset, so they need
// **a cursor taken before the reset.** The console's output cursor is absolute
// across the whole session and a machine reset does not rewind it, so `since: 0`
// would match the header printed by the run's *first* boot and the case would
// pass without the machine doing anything. Every wait here is anchored to where
// the stream stood when the reset went out.

// The header's first line. Multiline, because it doubles as an assertion
// against a whole boot's output; `expectFrom` takes the pattern's source and
// applies its own line-anchor translation, so the flag is ignored on that path.
export const HEADER = /^6502 BIOS v(\d+)\.(\d+)$/m

// What to wait for, as opposed to what to assert afterwards. BASIC prints the
// whole header before the prompt, so a wait that stopped at its first line
// would return output the rest of the boot had not been printed into yet.
export const BASIC_READY = /^OK$/m

// The names the header's hardware line uses, in HW_PRESENT's bit order. Either
// RAM card (bits 0 and 1) prints one RAM.
export const HW_NAMES = [
  [0x03, 'RAM'], [0x04, 'RTC'], [0x08, 'CF'], [0x10, 'SER'],
  [0x20, 'VIA'], [0x40, 'SID'], [0x80, 'VDP'],
]

export function hardwareLine(present) {
  return HW_NAMES.filter(([bits]) => present & bits).map(([, name]) => name).join(' ')
}

// Reset the machine and wait for whatever that was supposed to start. Cold by
// default, which also zeroes RAM; `cold: false` is the reset button. Returns
// the console output and the emulated cycles the whole boot took.
export async function coldBoot(m, { cold = true, expect, timeoutMs = 60000 } = {}) {
  const { cursor } = await m.serialRead(0)
  await m.reset(cold)
  const started = await m.cycles()
  await m.start()
  const result = await m.expectFrom(cursor, expect, { timeoutMs })
  return { output: result.output, cycles: (await m.cycles()) - started }
}
