// README § Video & Display: "`LOCATE <row>, <col>` — Move cursor to row 0–23,
// column 0–39".
//
// Row first, column second — which is worth asserting on its own, because the
// `VideoSetCursor` slot it calls takes them the other way round (`X`=column,
// `Y`=row, per the jump table). A statement that passed them straight through
// would put text at (col, row), and on a square region of the screen nobody
// would notice.
//
// The edges are what the case is built from — the last row and the last column,
// which a row/column swap, an off-by-one, or a width taken as 40 instead of 39
// all get wrong, and the middle of the screen is where all of those look fine.
//
// The bottom-right cell is deliberately not among them. Printing there fills
// the last cell of the last row, the cursor advances off the end, and the
// screen scrolls — so a marker put at (23,39) is at (22,39) by the time it can
// be read, along with everything else moved up a row. That is the terminal
// behaving correctly, and it belongs to
// printing-past-the-last-row-scrolls-the-screen. Here it would only be a way of
// destroying the evidence. Each edge is tested against a cell that does not sit
// on the other one.

import { awaitScreen, typeLine, cursor, assertAt, render, ROWS, COLUMNS } from '../lib/video.mjs'

export const name = 'LOCATE puts the cursor on the row and column it names'
export const profile = 'video'

const VideoSetCursor = 0xa01e

// A distinct marker per cell, so a character that landed in the wrong place is
// traceable to the LOCATE that put it there rather than just "something is
// wrong somewhere".
const CELLS = [
  [0, 0, 'A'], // the top left
  [0, COLUMNS - 1, 'B'], // the last column, clear of the last row
  [ROWS - 1, 0, 'C'], // the last row, clear of the last column
  [ROWS - 1, COLUMNS - 2, 'D'], // and as far along it as it can go without scrolling
  [12, 20, 'E'], // the middle, where every mistake above looks fine
  [1, 1, 'F'],
]

export async function run(m) {
  // One line, so nothing scrolls between the LOCATEs — a prompt printed at the
  // bottom of the screen would move everything up by a row and every assertion
  // below it with it.
  const program = ['CLS', ...CELLS.map(([r, c, ch]) => `LOCATE ${r},${c} : PRINT "${ch}";`)]
  await typeLine(m, program.join(' : '))

  const lines = await awaitScreen(
    m,
    (l) => CELLS.every(([r, c, ch]) => l[r]?.[c] === ch),
    'showed every marker at the cell its LOCATE named',
  )
  for (const [row, column, character] of CELLS) {
    assertAt(m, lines, row, column, character, `LOCATE ${row},${column}`)
  }

  // Nothing else was drawn. A LOCATE that also emitted a space, or moved the
  // cursor by way of the top left, would leave a trail — so the whole screen is
  // compared against the one the six markers describe, not just the six cells.
  //
  // Except the row BASIC's prompt is on. `OK` is correct output and lands on
  // whatever row the statement left the cursor at, which is not a fact about
  // LOCATE. No marker is on it.
  const expected = Array.from({ length: ROWS }, () => Array(COLUMNS).fill(' '))
  for (const [row, column, character] of CELLS) expected[row][column] = character
  const promptRow = lines.findIndex((line) => line.startsWith('OK'))
  for (let row = 0; row < ROWS; row++) {
    if (row === promptRow) continue
    m.assertEqual(
      lines[row],
      expected[row].join(''),
      `row ${row} holds something no LOCATE put there. The screen reads:\n${render(lines)}`,
    )
  }

  // The Kernal slot takes its arguments the other way round, and the cursor
  // variables are the place that difference is visible. Read with the machine
  // stopped where the routine returned.
  await m.call6502(VideoSetCursor, { X: 7, Y: 19 })
  const at = await cursor(m)
  m.assertEqual(at.column, 7, 'VideoSetCursor with X=7: the column')
  m.assertEqual(at.row, 19, 'VideoSetCursor with Y=19: the row')
}
