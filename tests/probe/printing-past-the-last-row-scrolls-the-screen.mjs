// README § Video: "The screen scrolls upward automatically when the cursor
// reaches the bottom."
//
// Scrolling is the one screen operation with a *destructive* half, and the
// destructive half is the one worth asserting. Everything moving up a row is
// easy to get right and easy to see; the top line being gone, and the bottom
// line being blank rather than a copy of what used to be there, are what a
// scroll that copied the wrong way or one row short would get wrong — and both
// leave a screen that still looks broadly correct.
//
// This is also where the bottom-right cell belongs. Filling the last cell of
// the last row advances the cursor off the end, and the scroll that follows is
// why locate-puts-the-cursor-on-a-cell stays away from that corner.

import { awaitScreen, typeLine, render, ROWS, COLUMNS } from '../lib/video.mjs'

export const name = 'printing past the last row scrolls the screen up and drops the top line'
export const profile = 'video'

const VideoScroll = 0xa024

export async function run(m) {
  // Number every row with its own value, so where a line ends up after the
  // scroll is unambiguous. `L01`..`L24` fills the screen exactly: the print of
  // the last one takes the cursor to row 23, and the CRLF after it is what
  // scrolls.
  await typeLine(m, `CLS : FOR I=1 TO ${ROWS} : PRINT "L";RIGHT$("0"+MID$(STR$(I),2),2) : NEXT`)
  const full = await awaitScreen(
    m,
    (l) => l.some((line) => line.startsWith(`L${ROWS}`)),
    'filled every row',
  )

  // How *far* it has scrolled is not a fact about scrolling: the echo of the
  // typed line takes rows of its own, and so does the prompt. What is a fact is
  // that the early lines are gone, the late ones are not, and what remains is
  // a consecutive run — a scroll that dropped two rows at a time, or copied a
  // row twice, breaks the run without changing how much fell off the top.
  m.assert(
    !full.some((line) => line.startsWith('L01')),
    `the first line survived a screen that filled past it:\n${render(full)}`,
  )
  const numbered = full.filter((line) => /^L\d\d /.test(line)).map((line) => Number(line.slice(1, 3)))
  m.assert(numbered.length > 1, `expected several numbered rows, found ${numbered.length}`)
  m.assertEqual(numbered.at(-1), ROWS, `the last line printed is still on screen`)
  m.assertEqual(
    numbered.join(','),
    numbered.map((_, i) => numbered[0] + i).join(','),
    `the surviving rows are not consecutive — a scroll lost or duplicated one:\n${render(full)}`,
  )

  // Now the destructive half, one scroll at a time, through the Kernal slot —
  // `call6502` stops the machine the moment it returns, so exactly one scroll
  // is observed rather than however many BASIC's prompt causes next.
  const before = await m.screenText()
  await m.call6502(VideoScroll)
  const after = await m.screenText()

  for (let row = 0; row < ROWS - 1; row++) {
    m.assertEqual(
      after[row],
      before[row + 1],
      `row ${row} after VideoScroll should be what row ${row + 1} was. ` +
        `The screen reads:\n${render(after)}`,
    )
  }
  m.assertEqual(
    after[ROWS - 1],
    ' '.repeat(COLUMNS),
    `VideoScroll left the bottom row holding its old contents rather than ` +
      `blanking it:\n${render(after)}`,
  )

  // And the corner: a character written into the last cell of the last row
  // takes the screen up with it. This is what locate-puts-the-cursor-on-a-cell
  // stays away from, asserted here where it is the subject.
  //
  // Which row the marker ends up on is again not the claim — the prompt that
  // follows scrolls the screen again, and again. The claim is that it did not
  // stay on the last row, and that the line above it went off the top.
  await typeLine(m, `CLS : PRINT "TOP" : LOCATE ${ROWS - 1},${COLUMNS - 1} : PRINT "X";`)
  const scrolled = await awaitScreen(
    m,
    (l) => l.some((line) => line.includes('X')),
    'drew in the bottom right corner',
  )
  const marker = scrolled.findIndex((line) => line[COLUMNS - 1] === 'X')
  m.assert(marker >= 0, `nothing was drawn in the last column:\n${render(scrolled)}`)
  m.assert(
    marker < ROWS - 1,
    `the bottom right cell was filled and the screen did not scroll — the marker ` +
      `is still on row ${marker}:\n${render(scrolled)}`,
  )
  m.assert(
    !scrolled.some((line) => line.startsWith('TOP')),
    `the screen scrolled but the top line survived it:\n${render(scrolled)}`,
  )
}
