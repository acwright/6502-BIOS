// README: "Serial absent — IRQ handler skips serial status polling; Chrin flow
// control writes are suppressed; XModem LOAD/SAVE return an error".
//
// The serial row is the one that cannot be driven from the console, because the
// console *is* the serial card. With the bit cleared the IRQ handler stops
// reading the ACIA, so nothing typed after that reaches the input buffer — the
// `hw:` directive would take the keyboard away along with the card.
//
// So the machine takes the card away from itself, mid-program: HW_PRESENT is
// $030D = 781, and a POKE at the top of the program clears bit 4 for the lines
// that follow. Everything the case needs to type is typed while the card is
// still there.
//
// Output keeps working throughout, which is what makes the verdict readable:
// serial output is not gated on the probe's bit — SerialChrout writes the data
// register and polls the transmit flag — so a machine that thinks it has no
// serial card still talks to the terminal it has.
//
// Nothing is typed while the bit is clear, deliberately. The emulator's ACIA is
// still physically there and would raise an interrupt the handler is now
// skipping past, which is a state a real machine with an empty slot cannot
// reach; asserting anything about it would be asserting about the emulator.
import { escapeRegex } from '../lib/basic.mjs'

export const name = 'with no serial card, the XModem LOAD and SAVE paths report NO DEVICE'

const HW_PRESENT = 0x030d
const HW_SC = 0x10

export async function run(m) {
  const present = await m.peek(HW_PRESENT)
  m.assert((present & HW_SC) !== 0, `expected a serial card to start with, HW_PRESENT=$${present.toString(16)}`)

  // Bare LOAD and bare SAVE are the XModem paths — a filename sends them to the
  // CF card instead. Each run clears the bit for itself, since the restore in
  // between puts it back.
  for (const line of [
    '10 POKE 781, PEEK(781) AND 239',
    '20 PRINT "STILL HERE"',
    '30 SAVE',
    '40 POKE 781, PEEK(781) AND 239',
    '50 LOAD',
  ]) {
    // A stored line prints nothing back, so each one waits for its own echo.
    await m.send(`${line}\r`, escapeRegex(line))
  }

  // The program gets as far as its PRINT with the card gone — the machine keeps
  // running after the IRQ handler loses its serial branch — and then the XModem
  // path reports the card, by line number, rather than waiting for a transfer
  // that can never start.
  const saved = await m.send('RUN\r', /\?NO DEVICE ERROR IN 30/, { timeoutMs: 30000 })
  m.assertMatch(saved.output, /^STILL HERE$/m, 'output before the SAVE')

  await m.write(HW_PRESENT, [present])
  await m.send('RUN 40\r', /\?NO DEVICE ERROR IN 50/, { timeoutMs: 30000 })

  // And the console is still a console: the prompt takes input, which is the
  // evidence that neither run left the machine wedged.
  await m.write(HW_PRESENT, [present])
  const alive = await m.send('PRINT 6 * 7\r', /^ 42$/)
  m.assertMatch(alive.output, /^ 42$/m, 'the prompt after the card came back')
}
