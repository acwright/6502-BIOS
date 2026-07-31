// README § Video & Display: "`CLS` — Clear the screen and reset cursor to
// (0, 0)", and the `VideoClear` slot ($A018) underneath it.
//
// Two halves, and the second one is invisible. A blank screen looks the same
// whatever the cursor thinks, so a clear that emptied the name table and left
// the cursor at row 12 would satisfy any assertion made by reading the screen —
// and the next thing printed would appear halfway down, which is what the user
// would actually notice.
//
// So it is asserted twice, in the two places it can be. Through the Kernal slot,
// where `call6502` leaves the machine paused the instant the routine returns and
// the cursor variables can be read before anything else runs; and through the
// BASIC statement, where the proof is that the next character lands at the top
// left. The statement cannot be checked the first way: by the time `CLS` has
// returned to the prompt, BASIC has printed `OK` and moved the cursor on, which
// is correct and which no assertion about a wholly blank screen can survive.

import { awaitScreen, typeLine, cursor, assertAt, render } from '../lib/video.mjs'

export const name = 'CLS clears the screen and puts the cursor back at (0,0)'
export const profile = 'video'

const VideoClear = 0xa018

export async function run(m) {
  // Put something on the screen first, and far enough down that "cleared" is a
  // real claim rather than the state it was already in.
  await typeLine(m, 'FOR I=1 TO 12 : PRINT "ROW";I : NEXT')
  await awaitScreen(m, (lines) => lines.some((l) => l.includes('ROW 12')), 'filled up')

  const filled = await cursor(m)
  m.assert(filled.row > 0, `nothing was drawn down the screen — cursor at row ${filled.row}`)

  // The Kernal slot, with the machine stopped where it returned.
  await m.call6502(VideoClear)
  const lines = await m.screenText()
  const dirty = lines.findIndex((line) => line.trim() !== '')
  m.assert(dirty < 0, `VideoClear left row ${dirty} on screen:\n${render(lines)}`)

  const homed = await cursor(m)
  m.assertEqual(homed.column, 0, "the cursor's column after VideoClear")
  m.assertEqual(homed.row, 0, "the cursor's row after VideoClear")

  // And the BASIC statement, whose proof is where the next character lands. The
  // print is on the same line so that nothing — not even the prompt — runs
  // between the clear and the thing that tests it.
  await typeLine(m, 'CLS : PRINT "HOME";')
  const printed = await awaitScreen(
    m,
    (l) => l.some((line) => line.includes('HOME')),
    'printed after CLS',
  )
  assertAt(m, printed, 0, 0, 'HOME', 'the first thing CLS printed')

  // And the fill is gone rather than merely scrolled off the top.
  m.assert(
    !printed.some((line) => line.includes('ROW ')),
    `CLS left the old screen behind:\n${render(printed)}`,
  )
}
