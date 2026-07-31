// A round trip that compares bytes rather than behaviour. The console cases
// prove a saved program still runs; this one proves it came back *identical*,
// which is what "round-trip a program intact" has to mean if a `.prg`'s
// machine code is to survive — and what a save that rounded the length up, or
// a load that stopped at the chain terminator, would quietly get wrong.
export const name = 'SAVE and LOAD return the program byte for byte'

// README: "LOAD "name" — Load a named file from CompactFlash to $0800",
//         "SAVE "name" — Save the current program to CompactFlash"

const PROGRAM_START = 0x0800
const BAS_VARTAB = 0x035f

const LINES = [
  '10 A = 6 * 7',
  '20 IF A <> 42 THEN PRINT "NO"',
  '30 FOR I = 1 TO 3 : NEXT I',
  '40 PRINT "DONE";A',
]

export async function run(m) {
  for (const line of LINES) {
    await m.send(line + '\r', line.split(' ')[1])
  }

  const end = await m.peekWord(BAS_VARTAB)
  const before = await m.read(PROGRAM_START, end - PROGRAM_START)
  m.assert(before.length > 40, `the program is implausibly short: ${before.length} bytes`)

  await m.send('SAVE "P"\r', /^OK/)
  await m.send('NEW\r', /^OK/)
  m.assertWord(await m.peekWord(BAS_VARTAB), PROGRAM_START + 2, 'VARTAB after NEW')

  await m.send('LOAD "P"\r', /^OK/)

  // Both halves of "intact": the same bytes, and the same idea of where the
  // program ends. VARTAB is what protects everything above the text from the
  // first variable assignment, so a load that restored the bytes and not the
  // pointer would pass a byte comparison and still lose a `.prg`.
  m.assertWord(await m.peekWord(BAS_VARTAB), end, 'VARTAB after LOAD')
  m.assertBytes(await m.read(PROGRAM_START, end - PROGRAM_START), before, 'program text')

  const { output } = await m.send('RUN\r', /^OK/)
  m.assertMatch(output, /^DONE 42/m, 'the reloaded program')
}
