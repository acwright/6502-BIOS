// Driving a machine through the boot menu, for the §6.1 cases.
//
// Every other case in the suite starts from the snapshot taken at the `OK`
// prompt, which is boot already over. These start from a reset and watch the
// boot itself, so they need two things the rest of the suite does not.
//
// **A cursor taken before the reset.** The console's output cursor is absolute
// across the whole session and a machine reset does not rewind it, so `since: 0`
// would match the banner printed by the run's *first* boot and the case would
// pass without the machine doing anything. Every wait here is anchored to where
// the stream stood when the reset went out.
//
// **Elapsed emulated cycles.** The difference between "ENTER started BASIC" and
// "the menu timed out and started BASIC" is not in the output — it is identical
// — it is in how long the machine took to get there. Cycles are the only thing
// that tells the two apart, and they are exact rather than a host-clock guess.

// README boot step 9: "waits ~5 seconds for a keypress". The menu is 50
// iterations of a 100 ms `SysDelay`, so at 1 MHz that is 5 M cycles, plus the
// probe and the beep on the way in.
export const MENU_CYCLES = 5000000

// Multiline, because these double as assertions against a whole boot's output.
// `expectFrom` takes the pattern's source and applies its own line-anchor
// translation, so the flag is ignored on that path rather than conflicting.
export const BASIC_BANNER = /^6502 BASIC V2\.0$/m
export const MONITOR_BANNER = /^6502 MONITOR v1\.1$/m

// What to wait for, as opposed to what to assert afterwards. BASIC prints its
// banner and then its free-memory line before the prompt, so a wait that
// stopped at the banner would return output the rest of the boot had not been
// printed into yet.
export const BASIC_READY = /^OK$/m

// The Monitor's entry is banner, `BRK AT $xxxx`, registers, prompt — so the
// register line is the one to wait on. Waiting on the banner returns output the
// three lines after it have not been printed into yet, which passes or fails
// depending on how the host was scheduled.
export const MONITOR_READY =
  /^PC=[0-9A-F]{4} A=[0-9A-F]{2} X=[0-9A-F]{2} Y=[0-9A-F]{2} SP=[0-9A-F]{2} [N\-][V\-]-[B\-][D\-][I\-][Z\-][C\-]$/m

// Cold-reset the machine, optionally press one key at the boot menu, and wait
// for whatever that was supposed to start. Returns the console output and the
// emulated cycles the whole boot took.
export async function coldBoot(m, { key = null, expect, timeoutMs = 60000 } = {}) {
  const { cursor } = await m.serialRead(0)
  await m.reset(true)
  const started = await m.cycles()
  await m.start()

  // The key goes out immediately. It sits in the ACIA's receive register — one
  // byte, no overrun — until the boot menu's first IRQ after `cli` collects it,
  // which is what a user holding ESC through a power-on does too.
  if (key != null) await m.serialWrite(key)

  const result = await m.expectFrom(cursor, expect, { timeoutMs })
  return { output: result.output, cycles: (await m.cycles()) - started }
}
