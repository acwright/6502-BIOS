// INKEY cannot be asserted from BASIC alone: the verdict depends on whether a
// key is waiting, which only the machine client can arrange.
//
// It reads BAS_PENDKEY first and falls back to the console input buffer, which
// on a serial machine is fed by the serial port — so the key is delivered as a
// raw byte with no carriage return, not through input.key, which targets the
// PS/2 keyboard this profile does not have.
export const name = 'INKEY returns 0 with no key waiting and the code with one'

export async function run(m) {
  // Nothing waiting: INKEY is documented non-blocking, so a 0 comes back
  // promptly. Were it to block, this send would time out instead.
  const idle = await m.send('PRINT INKEY\r', /^OK/)
  m.assertMatch(idle.output, /^ 0$/m, 'INKEY with no key waiting')

  // A program that spins until a key shows up. The spin is the non-blocking
  // half of the assertion: INKEY has to keep returning so the loop can turn.
  await m.send('10 K = INKEY\r', /INKEY/)
  await m.send('20 IF K = 0 THEN GOTO 10\r', /THEN/)
  await m.send('30 PRINT "GOT";K\r', /GOT/)
  await m.send('40 PRINT "THEN";INKEY\r', /THEN/)

  const started = await m.serialWrite('RUN\r')
  await m.serialWrite('A') // 65, and deliberately no CR
  const out = await m.expectFrom(started.cursor, /^THEN/m, { timeoutMs: 20000 })

  m.assertMatch(out.output, /^GOT 65$/m, 'INKEY delivered the key')
  // Reading consumes it, or the same key would be delivered forever.
  m.assertMatch(out.output, /^THEN 0$/m, 'INKEY after the key was consumed')
}
