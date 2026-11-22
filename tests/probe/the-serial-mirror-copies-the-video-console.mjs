// With a video console, BASIC reads the serial line as well as the keyboard, but
// before the mirror it answered only on the screen: a terminal or an agent on
// the line could type and never see the reply. IO_MODE bit 1 (IO_MIRROR) sends
// every character Chrout puts on the screen to serial as well.
//
// The claims, in order:
// - it is off after a boot, and with it off the line stays silent, as before;
// - `POKE 774,2` turns it on, and then a line typed over serial is echoed and
//   answered on the line, as well as on the screen;
// - a line typed at the keyboard reaches the line too, echo and answer;
// - a reset turns it off again: the header after it goes to the screen only.
//
// Off at every boot is the owner's ruling (2026-11-21): the mirror holds a
// print loop to serial speed, so nobody pays for it without asking.

import { typeLine, awaitScreen } from '../lib/video.mjs'

export const name = 'IO_MODE bit 1 mirrors the video console to serial, and every boot leaves it off'
export const profile = 'video'

const IO_MODE = 0x0306

const shows = (text) => (lines) => lines.some((l) => l.startsWith(text))

export async function run(m) {
  m.assertByte(await m.peek(IO_MODE), 0x00, 'IO_MODE after the boot')

  // Off: the screen answers, the line says nothing.
  let { cursor } = await m.serialRead(0, 0)
  await typeLine(m, 'PRINT "SCREEN ONLY"')
  await awaitScreen(m, shows('SCREEN ONLY'), 'SCREEN ONLY on the screen')
  m.assertEqual(await m.settle(cursor), '', 'what the line carried with the mirror off')

  // On, from the keyboard: the OK after the POKE is the first thing mirrored.
  ;({ cursor } = await m.serialRead(0, 0))
  await typeLine(m, 'POKE 774,2')
  await m.expectFrom(cursor, /^OK$/)
  m.assertByte(await m.peek(IO_MODE), 0x02, 'IO_MODE after POKE 774,2')

  // Typed over serial: echoed and answered on the line, and on the screen.
  const { output: answer } = await m.send('PRINT 6*7\r', /^OK$/)
  m.assertMatch(answer, /^PRINT 6\*7$/m, 'the echo of a line typed over serial')
  m.assertMatch(answer, /^ 42$/m, 'the answer to a line typed over serial')
  await awaitScreen(m, shows(' 42'), 'the answer on the screen as well')

  // Typed at the keyboard: the line sees that too.
  ;({ cursor } = await m.serialRead(0, 0))
  await typeLine(m, 'PRINT "FROM THE KEYBOARD"')
  const { output: typed } = await m.expectFrom(cursor, /^OK$/)
  m.assertMatch(typed, /^PRINT "FROM THE KEYBOARD"$/m, 'the echo of a line typed at the keyboard')
  m.assertMatch(typed, /^FROM THE KEYBOARD$/m, 'the answer to a line typed at the keyboard')

  // A reset turns it off: the header goes to the screen, and only there.
  ;({ cursor } = await m.serialRead(0, 0))
  await m.reset(false)
  await m.start()
  await awaitScreen(m, shows('OK'), 'the prompt after the reset')
  m.assertByte(await m.peek(IO_MODE), 0x00, 'IO_MODE after the reset')
  m.assertEqual(await m.settle(cursor), '', 'what the line carried during and after the reset')
}
