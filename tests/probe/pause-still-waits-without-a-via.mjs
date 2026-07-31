// README: "GPIO/VIA absent — SysDelay falls back to a calibrated software
// busy-loop; JOY() returns $FF ...; keyboard IRQ check is skipped".
//
// The VIA row's timing half. With the VIA fitted, PAUSE arms timer T1 and waits
// on it; with no VIA there is no timer to arm, and a delay routine that read a
// register nothing drives would either return at once or never come back. The
// fallback exists so that neither happens, and cycles are the only way to tell:
// a PAUSE that returned instantly prints exactly what a correct one prints.
//
// The band is deliberately wide, for the same reason as the fitted case
// (pause-waits-about-the-right-time): a busy-loop calibrated for 1 MHz is not
// going to agree with a timer at 2 MHz, and the BIOS promises no cycle counts.
// What is being caught is a fallback that does not wait, or one that hangs.
export const name = 'PAUSE still waits about the right time with no VIA fitted'
export const hw = '-gpio'

const CENTISECONDS = 50
const CPU_HZ = 2_000_000
const EXPECTED = (CPU_HZ * CENTISECONDS) / 100

export async function run(m) {
  const before = await m.cycles()
  await m.send(`PAUSE ${CENTISECONDS}\r`, /^OK/, { timeoutMs: 30000 })
  const elapsed = (await m.cycles()) - before

  m.assert(
    elapsed > EXPECTED / 8,
    `PAUSE ${CENTISECONDS} with no VIA took ${elapsed} cycles — the software ` +
      `fallback is not waiting (a hardware-timed PAUSE is about ${EXPECTED})`,
  )
  m.assert(
    elapsed < EXPECTED * 8,
    `PAUSE ${CENTISECONDS} with no VIA took ${elapsed} cycles, far longer than the ` +
      `${EXPECTED} a hardware-timed one takes`,
  )
}
