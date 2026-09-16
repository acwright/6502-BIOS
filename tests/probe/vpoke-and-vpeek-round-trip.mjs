// VDP-PLAN §7: VPOKE addr,value and VPEEK(addr) reach all 64 KB of VRAM.
//
// The program checks itself and prints PASS or FAIL, as a Tier 1 case would —
// Tier 1 needs the serial console, and the serial profile has no video card.
// The addresses are the ends of VRAM and both sides of a VBANK boundary. VRAM
// is read back through the debugger too, so a VPEEK that agreed with a VPOKE
// writing somewhere else is caught.
//
// The last pair is the POKE pin: an address expression, and a value expression
// that runs VPEEK itself, which must not move the address parked across it.

import { typeProgram, typeLine, awaitScreen, render } from '../lib/video.mjs'

export const name = 'VPOKE and VPEEK round-trip anywhere in the 64 KB of VRAM'
export const profile = 'video'

const WRITES = [[4096, 17], [16383, 34], [16384, 51], [65535, 68], [40000, 85]]

export async function run(m) {
  await m.write(0x1000, [0x9c])
  await typeProgram(m, [
    `10 ${WRITES.map(([a, v]) => `VPOKE ${a},${v}`).join(' : ')}`,
    `20 IF ${WRITES.map(([a, v]) => `VPEEK(${a})<>${v}`).join(' OR ')} THEN PRINT "FAIL" : END`,
    '30 A = 30000 : VPOKE A + PEEK(4096), VPEEK(4096) + 1',
    '40 IF VPEEK(30156) <> 18 THEN PRINT "FAIL"; VPEEK(30156) : END',
    '50 PRINT "PASS"',
  ])
  await typeLine(m, 'RUN')
  const screen = await awaitScreen(m, (s) => s.some((l) => /^(PASS|FAIL)/.test(l)), 'the verdict')
  m.assert(screen.some((l) => l.startsWith('PASS')), `the program says:\n${render(screen)}`)

  for (const [address, value] of WRITES) {
    m.assertByte(await m.peek(address, 'vram'), value, `VRAM $${address.toString(16).toUpperCase()}`)
  }
  m.assertByte(await m.peek(30156, 'vram'), 18, 'VRAM 30156, from expressions')
}
