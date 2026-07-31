// README step 8: the splash is "displayed on the active console", and step 9's
// menu offers ENTER and ESC for the five seconds that follow.
//
// On a serial-only machine neither appeared. The menu was running the whole
// time — ESC did enter the Monitor, and the timeout did start BASIC — but the
// user was never told, and sat through five silent seconds not knowing there
// was a choice to make. That is the half of boot a serial user cannot see, and
// it is the console most machines built from this BIOS actually have.
//
// **Plain text, not the video rendering.** The video path centres both lines by
// placing the cursor (`(40-24)/2 = 8`), which a serial terminal has no
// equivalent for — its width is whatever the user's terminal is. So the same
// two strings go out through Chrout, left aligned, and the assertion here is
// deliberately anchored to the line start: a splash that arrived with the
// video path's eight spaces in front of it would be a rendering nobody asked
// for on a console that cannot promise a width.
//
// The companion cases: splash-renders-on-video for the centred half, and
// version-agrees-with-splash for the string in the ROM against KernalVersion.

import { coldBoot, BASIC_READY, MONITOR_READY } from '../lib/boot.mjs'

export const name = 'the boot splash and menu print on a serial console too'

const MENU = 'ENTER=BASIC  ESC=MONITOR'

function assertSplash(m, output, what) {
  const lines = output.split('\n').map((line) => line.trimEnd())
  const title = lines.findIndex((line) => line.startsWith('-- 6502 BIOS v'))
  m.assert(title >= 0, `${what}: no splash title. Console said:\n${output}`)
  m.assertEqual(lines[title + 1], MENU, `${what}: the line after the title`)
  return lines[title]
}

export async function run(m) {
  // The timeout path: the splash and the menu, and then the banner of whatever
  // the menu started — in that order, since a menu printed after the thing it
  // offers a choice about is no use to anyone.
  const timedOut = await coldBoot(m, { expect: BASIC_READY })
  const title = assertSplash(m, timedOut.output, 'booting into BASIC')

  const lines = timedOut.output.split('\n').map((line) => line.trimEnd())
  m.assert(
    lines.findIndex((line) => line.startsWith('-- 6502 BIOS v')) <
      lines.findIndex((line) => line.startsWith('6502 BASIC')),
    `the splash printed after BASIC had already started:\n${timedOut.output}`,
  )

  // The version on the console is the version the Kernal reports, as it is on
  // the video path — the two renderings must not drift apart.
  const regs = await m.call6502(0xa07b)
  m.assertEqual(title, `-- 6502 BIOS v${regs.A}.${regs.X} --`, 'the splash title')

  // And it is printed before the menu takes a key, not on the way out of it:
  // ESC arrives during the countdown, so a splash that only printed once the
  // menu was over would be missing here.
  const escaped = await coldBoot(m, { key: '\x1b', expect: MONITOR_READY })
  assertSplash(m, escaped.output, 'booting into the Monitor')
}
