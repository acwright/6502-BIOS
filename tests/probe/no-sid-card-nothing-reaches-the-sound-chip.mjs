// README: "SID absent — Beep, SOUND, VOL, SidPlayNote, SidSilence silently
// return".
//
// "Silently" is a claim about the bus, and the console cannot see it. A ROM that
// wrote the registers anyway would look identical from the prompt — no error, no
// output — because there is nothing at $9800 to answer back. On a real machine
// those writes land on whatever else decodes that space, which is why the
// promise is worth pinning where it can actually be checked.
//
// The list names five things, and they sit at two levels: BASIC's VOL and SOUND,
// and the Kernal slots underneath them that a cartridge calls directly. Both are
// asserted, because a guard in the statement leaves the slot exposed and a guard
// in the slot is what makes the statement's promise true for everyone.

import { expectNoWrites } from '../lib/writes.mjs'

export const name = 'with no SID card, nothing is written to the sound registers'
export const hw = '-sid'

// BIOS.inc: three voices, seven registers each, from $9800, then the mode and
// volume register at $9818.
const SID_BASE = 0x9800
const SID_END = 0x981c

// The published slots, from the pinned jump table.
const BEEP = 0xa030
const SID_PLAY_NOTE = 0xa033
const SID_SILENCE = 0xa036

const statement = (m, text) =>
  expectNoWrites(m, {
    start: SID_BASE,
    end: SID_END,
    what: `${text.trim()} with no SID fitted`,
    body: () => m.serialWrite(`${text}\r`),
  })

// A Kernal slot has no prompt to come back to, so it is called through a planted
// stub instead and the watchpoint is read off that: call6502 runs to the stub's
// return breakpoint, and a write to the chip stops the machine first, so the
// call reports that it never returned. That is the assertion, restated — with
// the stop the case has to name itself, since a slot that touched the chip
// looks the same as one that hung.
async function slot(m, address, name, { A = 0, X = 0, Y = 0 } = {}) {
  await m.clearBreaks()
  await m.watch(SID_BASE, 'write', { end: SID_END })
  const before = await m.regs()
  const returnTo = await m.plantCall(address, { A, X, Y })
  const result = await m.runTo(returnTo)
  await m.clearBreaks()
  if (result.stop?.kind === 'watchpoint') {
    m.fail(`${name} wrote to $${result.stop.address.toString(16).toUpperCase()} with no SID fitted`)
  }
  m.assertEqual(result.stop?.kind, 'breakpoint', `how ${name} stopped`)
  // Put the machine back where the stub found it, as call6502 does: the PC is
  // parked on the stub's trailing NOP otherwise, and the next thing to resume
  // runs off the end of it.
  const { PC, SP, P, A: a, X: x, Y: y } = before
  await m.setRegs({ PC, SP, P, A: a, X: x, Y: y })
}

export async function run(m) {
  await statement(m, 'VOL 9')
  await statement(m, 'SOUND 1,440,1')
  await statement(m, 'SOUND 3,110,1')

  // Beep already guarded itself before this phase; the other two are asserted
  // the same way rather than trusted, since a cartridge reaching for the chip
  // through the published API is exactly the caller that cannot check for
  // itself.
  await slot(m, BEEP, 'Beep ($A030)')
  await slot(m, SID_PLAY_NOTE, 'SidPlayNote ($A033)', { A: 0, X: 0x20, Y: 0x1f })
  await slot(m, SID_SILENCE, 'SidSilence ($A036)')
}
