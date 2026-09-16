// The suite reads the video console through the emulator's `screen.text`, and
// the Kernal scrolls that console by moving layer 0's origin (`L0SCRY`) rather
// than the bytes. So every screen assertion depends on one fact about the
// pinned emulator: whether `screen.text` shows the name table as displayed —
// scroll applied — or in storage order.
//
// The pinned build shows it as displayed (DEBUG-PROTOCOL § screen), so
// `lib/video.mjs` hands the lines through untouched. This case pins that, and
// fails loudly if an emulator change takes it away — rather than every screen
// case failing strangely, or a helper that rotated the rows starting to rotate
// them twice.
//
// Both halves are needed: an origin that really has moved, and the last line
// printed where a user would see it — directly above the prompt, near the
// bottom. In storage order it would be VID_TOP rows higher up.

import { run as runLine, render, ROWS } from '../lib/video.mjs'
import { REG_L0SCRY, VID_TOP } from '../lib/cells.mjs'

export const name = 'screen.text shows the console as scrolled, not in name-table order'
export const profile = 'video'

export async function run(m) {
  const lines = await runLine(
    m,
    'CLS : FOR I=1 TO 30 : PRINT "LINE";I : NEXT',
    (l) => l.some((line) => line.startsWith('LINE 30')) && l.some((line) => line.startsWith('OK')),
    'printed 30 lines',
  )

  const top = await m.peek(VID_TOP)
  const scrollY = (await m.videoRegisters())[REG_L0SCRY]
  m.assert(scrollY !== 0, 'L0SCRY is still 0 after 30 lines, so nothing here is scrolled')
  m.assertEqual(scrollY, top * 8, 'L0SCRY against VID_TOP')

  // Line 30, the blank line BASIC prints before the prompt, the prompt, and the
  // cursor's empty row at the bottom.
  const last = lines.findIndex((line) => line.startsWith('LINE 30'))
  m.assertEqual(last, ROWS - 4, `the row holding the last line printed:\n${render(lines)}`)
  m.assert(lines[ROWS - 2].startsWith('OK'), `the prompt is not under the last line:\n${render(lines)}`)
  m.assert(lines[0].startsWith('LINE '), `the top row is not one of the printed lines:\n${render(lines)}`)
}
