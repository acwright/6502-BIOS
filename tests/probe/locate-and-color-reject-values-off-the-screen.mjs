// README § Video & Display: "`LOCATE <row>, <col>` — Move cursor to row 0–23,
// column 0–39" and "`COLOR <fg>, <bg>` — Set TMS9918 text foreground/background
// colours (0–15 each)".
//
// Both ranges are documented and neither is enforced, and the two failures are
// different in kind.
//
// `LOCATE 24,0` computes a VRAM address past the end of the 960-byte name
// table, and everything printed afterwards lands outside the screen — or, worse,
// wraps back into the middle of it. A machine that has done this looks broken:
// output appears over the top of earlier lines at an offset, and nothing the
// user types puts it right.
//
// `COLOR 16,16` is the quieter one. The foreground is shifted left four and the
// background masked to four bits, so 16 becomes 0 in both — black on black, an
// entirely blank screen, for what the user typed as "one past the brightest".
// That is the same shape as `VOL 16` setting the volume to silence, which phase
// 5 fixed.
//
// Both should raise `?ILLEGAL QUANTITY ERROR`, as `VOL`, `SOUND` and `NVRAM`
// already do for their own documented ranges.

import { typeLine, awaitScreen, cursor, render, ROWS, COLUMNS } from '../lib/video.mjs'

export const name = 'LOCATE and COLOR reject a cell or a colour that does not exist'
export const profile = 'video'
export const xfail =
  'LOCATE and COLOR take any byte: LOCATE 24,0 points the cursor off the end of the name table and scrambles the screen, and COLOR 16,16 silently means black on black'
export const issue = 'tests/FINDINGS.md#locate-and-color-accept-values-off-the-screen'

const ERROR = /\?ILLEGAL QUANTITY ERROR/

// A statement, and whether it is inside the documented range.
const CASES = [
  [`LOCATE ${ROWS - 1},${COLUMNS - 1}`, true],
  ['LOCATE 0,0', true],
  [`LOCATE ${ROWS},0`, false],
  [`LOCATE 0,${COLUMNS}`, false],
  ['LOCATE 255,255', false],
  ['COLOR 15,15', true],
  ['COLOR 0,0', true],
  ['COLOR 16,0', false],
  ['COLOR 0,16', false],
  ['COLOR 255,255', false],
]

export async function run(m) {
  for (const [statement, legal] of CASES) {
    await typeLine(m, `CLS : ${statement}`)
    const lines = await awaitScreen(m, () => true, `settled after ${JSON.stringify(statement)}`)
    const complained = lines.some((line) => ERROR.test(line))

    if (legal) {
      m.assert(
        !complained,
        `${statement} is inside the documented range and was rejected:\n${render(lines)}`,
      )
    } else {
      m.assert(
        complained,
        `${statement} is outside the documented range and was accepted:\n${render(lines)}`,
      )
    }
  }

  // And a rejected LOCATE leaves the cursor where it was, rather than moving it
  // somewhere impossible and then complaining.
  await typeLine(m, 'CLS : LOCATE 5,5 : PRINT "X";')
  await awaitScreen(m, (l) => l.some((line) => line.includes('X')), 'drew the marker')
  const before = await cursor(m)
  await typeLine(m, `LOCATE ${ROWS},0`)
  await awaitScreen(m, (l) => l.some((line) => ERROR.test(line)), 'reported the bad cell')
  const after = await cursor(m)
  m.assert(
    after.row < ROWS && after.column < COLUMNS,
    `a rejected LOCATE left the cursor at ${after.row},${after.column}, off a ` +
      `${ROWS}x${COLUMNS} screen — it moved the cursor before checking (it was at ` +
      `${before.row},${before.column})`,
  )
}
