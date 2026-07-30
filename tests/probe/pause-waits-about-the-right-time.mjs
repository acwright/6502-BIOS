// PAUSE is a duration, so the assertion is on elapsed emulated cycles — the
// one thing in this suite measured in time rather than in output. Emulated
// cycles, not host milliseconds: the machine's own clock is deterministic
// however fast or loaded the host running the suite is.
export const name = 'PAUSE 50 waits roughly half a second of machine time'

// README: "PAUSE <n> — Pause for `n` centiseconds (~10 ms each)".
const CENTISECONDS = 50
const CPU_HZ = 2_000_000 // 6502 ACE clock; only the order of magnitude matters here
const EXPECTED = (CPU_HZ * CENTISECONDS) / 100

export async function run(m) {
  const before = await m.cycles()
  await m.send(`PAUSE ${CENTISECONDS}\r`, /^OK/, { timeoutMs: 30000 })
  const elapsed = (await m.cycles()) - before

  // A wide band on purpose. The BIOS makes no cycle guarantees (PLAN.md §1),
  // and PAUSE falls back to a calibrated software loop when the VIA is absent,
  // so this is here to catch PAUSE returning instantly or hanging — not to pin
  // a timing the ROM never promised.
  m.assert(
    elapsed > EXPECTED / 4 && elapsed < EXPECTED * 4,
    `PAUSE ${CENTISECONDS} took ${elapsed} cycles, expected roughly ${EXPECTED}`,
  )
}
