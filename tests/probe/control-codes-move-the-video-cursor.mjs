// The control codes `Chrout` handles on its way to the screen: carriage
// return, line feed, and backspace.
//
// These are the difference between `Chrout` ($A000) and `VideoChroutRaw`
// ($A02A), which the jump table describes as "raw, no control-code handling" —
// so the pair is what makes the distinction testable. The same byte through the
// two slots has to do two different things: move the cursor through one, draw a
// glyph through the other. A `Chrout` that had lost its control handling would
// print the CP437 glyph for $0D and leave the cursor where it was, and every
// line of output would run into the last.
//
// Backspace is the one with a destructive half. Moving the cursor back is not
// enough — the character under it has to go, or every correction a user types
// at the prompt leaves the old letter on screen under the new one.

import { cursor, render, COLUMNS } from '../lib/video.mjs'

export const name = 'CR, LF and backspace move the cursor through Chrout, and print through the raw slot'
export const profile = 'video'

const Chrout = 0xa000
const VideoChroutRaw = 0xa02a
const VideoClear = 0xa018
const VideoSetCursor = 0xa01e

const CR = 0x0d
const LF = 0x0a
const BACKSPACE = 0x08

// Everything here runs through call6502, which leaves the machine paused the
// moment each routine returns — so the screen and the cursor variables can be
// read between characters, with nothing else running in between. Typing this at
// the prompt would work too, and BASIC would echo, scroll and prompt over the
// top of every assertion.
const write = (m, byte) => m.call6502(Chrout, { A: byte })

export async function run(m) {
  await m.call6502(VideoClear)

  // --- carriage return: back to column 0, same row -------------------------
  await m.call6502(VideoSetCursor, { X: 10, Y: 5 })
  for (const byte of [...Buffer.from('ABC', 'latin1')]) await write(m, byte)
  let at = await cursor(m)
  m.assertEqual(at.column, 13, 'the column after three characters')
  m.assertEqual(at.row, 5, 'the row after three characters')

  await write(m, CR)
  at = await cursor(m)
  m.assertEqual(at.column, 0, 'the column after CR')
  m.assertEqual(at.row, 5, 'CR does not change the row')

  // --- line feed: down one row, same column --------------------------------
  await m.call6502(VideoSetCursor, { X: 7, Y: 5 })
  await write(m, LF)
  at = await cursor(m)
  m.assertEqual(at.row, 6, 'the row after LF')
  m.assertEqual(at.column, 7, 'LF does not change the column')

  // --- backspace: back one column, and the character is gone ---------------
  await m.call6502(VideoSetCursor, { X: 0, Y: 10 })
  for (const byte of [...Buffer.from('WRONG', 'latin1')]) await write(m, byte)
  let lines = await m.screenText()
  m.assertEqual(lines[10].slice(0, 5), 'WRONG', 'the text before the correction')

  await write(m, BACKSPACE)
  at = await cursor(m)
  m.assertEqual(at.column, 4, 'the column after backspace')
  m.assertEqual(at.row, 10, 'backspace does not change the row')

  lines = await m.screenText()
  m.assertEqual(
    lines[10].slice(0, 5),
    'WRON ',
    `backspace moved the cursor but left the character on screen:\n${render(lines)}`,
  )

  // The correction lands where the old character was.
  await write(m, 'G'.charCodeAt(0))
  lines = await m.screenText()
  m.assertEqual(lines[10].slice(0, 5), 'WRONG', 'the corrected text')

  // --- the raw slot does none of this --------------------------------------
  // Same byte, other slot: a glyph at the cursor, and the row unchanged. This
  // is what tells "Chrout handled the control code" apart from "the control
  // code happened to do nothing visible".
  await m.call6502(VideoClear)
  await m.call6502(VideoSetCursor, { X: 3, Y: 12 })
  await m.call6502(VideoChroutRaw, { A: CR })
  const raw = await m.screenText()
  const drawn = raw[12][3]
  m.assert(
    drawn !== ' ',
    `VideoChroutRaw drew nothing for $0D — it is handling the control code it ` +
      `promises not to:\n${render(raw)}`,
  )
  m.assertEqual((await cursor(m)).row, 12, 'the raw slot does not move to another row')
  m.assert(
    raw[12].slice(0, COLUMNS).trim().length === 1,
    `VideoChroutRaw drew more than one glyph:\n${render(raw)}`,
  )
}
