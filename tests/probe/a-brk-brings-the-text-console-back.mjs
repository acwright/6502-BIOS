// VDP-PLAN §4.5, step 1: a BRK taken while a program has the card in another
// mode puts the Text console back before it prints, so the report is readable
// rather than written into a table the display is not showing.
//
// The program's mode is faked from outside: Graphics (`VMODE` 3) on the card
// and `VID_MODE` saying the Kernal set it. The BRK then has to leave the card
// in Text mode, `VID_MODE` = $01, and the report on the screen.

import { typeLine, awaitScreen } from '../lib/video.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'a BRK in another video mode brings the Text console back to report on'
export const profile = 'video'

const CODE = 0x0900
const VDP_VMODE = 0x0d

export async function run(m) {
  await m.write(CODE, [0x00, 0x07])
  await m.call('video.setRegister', { register: VDP_VMODE, value: 3 })
  await m.write(VID_MODE, [0x03])
  m.assertEqual((await m.videoInfo()).mode.geometry, 'graphics', 'the geometry before the BRK')

  await typeLine(m, 'SYS 2304')
  const lines = await awaitScreen(
    m,
    (screen) => screen.some((l) => l.startsWith('BREAK $07 AT $0900')) && screen.some((l) => l.startsWith('OK')),
    'the BRK report and the prompt',
  )
  const report = lines.findIndex((l) => l.startsWith('BREAK $07 AT $0900'))
  m.assertMatch(lines[report + 1], /^A=[0-9A-F]{2} X=[0-9A-F]{2} Y=[0-9A-F]{2} P=[0-9A-F]{2} S=[0-9A-F]{2}\s*$/, 'the register line')

  const { mode } = await m.videoInfo()
  m.assertEqual(mode.vmode, 1, 'VMODE after the BRK')
  m.assertByte(await m.peek(VID_MODE), 0x01, 'VID_MODE after the BRK')
}
