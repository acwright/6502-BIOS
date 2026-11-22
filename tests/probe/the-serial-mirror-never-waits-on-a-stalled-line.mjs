// CTS high stops the R6551's transmitter, and TDRE then never sets. That is a
// terminal holding CTS, or a card that takes CTS from the cable with nothing
// plugged in: the ACE or the Serial Card with CTS EN on the cable, and the
// Serial Card Pro always. SerialChrout waits on TDRE with no limit, which is
// right for a serial console, but the mirror is only a copy of the screen, and
// the screen must never wait on it.
//
// So SerialMirror gives the register MIRROR_POLLS looks (about 7.6 ms at
// 1 MHz), then drops the byte and sets MIRROR_STALL; while that is set each
// byte gets a single look. The claims:
// - with CTS held high, the first byte waits in the register, the next waits
//   out the bound (longer than two characters on the line, so a healthy line
//   is never cut short) and is dropped, and the one after costs almost nothing;
// - every one of them still reaches the screen;
// - a BASIC loop prints all its lines on the screen while the line is stalled;
// - once CTS comes back, the mirror carries on by itself.

import { typeLine, awaitScreen, VID_CURSOR_X } from '../lib/video.mjs'

export const name = 'the serial mirror drops what a stalled line will not take, and the screen never waits'
export const profile = 'video-cts'

const Chrout = 0xa000
const IO_MODE = 0x0306
const MIRROR_STALL = 0x0379

const CHARACTER_CYCLES = 520 // one character at 19200 baud, at 1 MHz

const shows = (text) => (lines) => lines.some((l) => l.startsWith(text))

// Call Chrout and say how many cycles it took.
async function timed(m, character) {
  const before = await m.cycles()
  await m.call6502(Chrout, { A: character.charCodeAt(0) })
  return (await m.cycles()) - before
}

export async function run(m) {
  await m.pause()
  await m.write(IO_MODE, [0x02])
  const column = await m.peek(VID_CURSOR_X)

  await m.call('serial.lines', { cts: false })

  // The register is empty, so the first byte is written and waits there. A
  // stale MIRROR_STALL (nothing clears it at boot) would cost it one look only.
  await timed(m, 'A')
  m.assertByte(await m.peek(MIRROR_STALL), 0x00, 'MIRROR_STALL after the byte that filled the register')

  // The register stays full: the bounded wait, then the drop.
  const waited = await timed(m, 'B')
  m.assert(waited > 2 * CHARACTER_CYCLES, `the bounded wait took ${waited} cycles, no longer than two characters on the line`)
  m.assert(waited < 20000, `the bounded wait took ${waited} cycles`)
  m.assertByte(await m.peek(MIRROR_STALL), 0x80, 'MIRROR_STALL after a byte the line would not take')

  // Stalled: one look, and on.
  const glanced = await timed(m, 'C')
  m.assert(glanced < 1000, `a byte on a stalled line took ${glanced} cycles`)

  m.assertByte(await m.peek(VID_CURSOR_X), column + 3, 'the cursor column: all three bytes reached the screen')

  // A program that prints, with the line stalled, still fills the screen.
  await typeLine(m, 'FOR I=1 TO 30:PRINT "LINE";I:NEXT')
  await awaitScreen(m, (lines) => shows('LINE 30')(lines) && shows('OK')(lines), 'LINE 30 and the prompt, with CTS held high')

  // CTS back: the next line typed comes out on serial again.
  await m.pause()
  await m.call('serial.lines', { cts: true })
  const { cursor } = await m.serialRead(0, 0)
  await typeLine(m, 'PRINT "BACK"')
  const { output } = await m.expectFrom(cursor, /^OK$/)
  m.assertMatch(output, /^BACK$/m, 'the mirror once CTS came back')
  m.assertByte(await m.peek(MIRROR_STALL), 0x00, 'MIRROR_STALL once the line took a byte again')
}
