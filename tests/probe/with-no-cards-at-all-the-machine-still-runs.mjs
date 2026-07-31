// The last row of the README's degradation table, and the only one that is
// about the machine rather than about a statement: with nothing fitted at all,
// it still has to reach a usable state on the console it has.
//
// HW_PRESENT = $00 is a state the probe can produce on real hardware — an empty
// backplane with a terminal on the serial header is a machine somebody will
// build — so the guards have to compose. Each row above tests one card taken
// away; this is the case where every guard is on at once, which is where a
// routine that falls through into another card's path shows up.
//
// The mask is cleared by the program itself rather than by the `hw:` directive,
// for the reason the serial row gives: clearing bit 4 stops the IRQ handler
// reading the ACIA, so nothing can be typed afterwards. Everything this case
// needs to say is typed first, and the verdict comes back on the output path,
// which is not gated on the probe.
export const name = 'with no cards fitted at all, the machine still runs and still prints'

import { escapeRegex } from '../lib/basic.mjs'

const HW_PRESENT = 0x030d

const PROGRAM = [
  '10 POKE 781, 0',
  // Every statement the table promises will go quiet rather than complain,
  // one after another, on a machine that has none of the hardware behind them.
  '20 CLS',
  '30 LOCATE 5, 5',
  '40 COLOR 1, 0',
  '50 VOL 7',
  '60 SOUND 1, 440, 1',
  '70 PAUSE 2',
  // And then real work, to show the interpreter is still an interpreter.
  '80 A = 0',
  '90 FOR I = 1 TO 100 : A = A + I : NEXT',
  '100 PRINT "HW";PEEK(781)',
  '110 PRINT "SUM";A',
]

export async function run(m) {
  const present = await m.peek(HW_PRESENT)
  m.assert(present !== 0, 'the probe found no hardware at all before the case even started')

  for (const line of PROGRAM) {
    await m.send(`${line}\r`, escapeRegex(line))
  }

  const { output } = await m.send('RUN\r', /^OK/, { timeoutMs: 30000 })

  // The mask really was empty when the arithmetic ran — not restored by
  // something in between — and the loop really did run.
  m.assertMatch(output, /^HW 0$/m, 'the mask the program itself read back')
  m.assertMatch(output, /^SUM 5050$/m, 'the arithmetic with nothing fitted')
  m.assertNoMatch(output, /ERROR/, 'the program with nothing fitted')

  // Put the cards back and check the prompt is still a prompt. Everything above
  // is one program; this is the machine afterwards.
  await m.write(HW_PRESENT, [present])
  const alive = await m.send('PRINT 6 * 7\r', /^ 42$/)
  m.assertMatch(alive.output, /^ 42$/m, 'the prompt after the cards came back')
}
