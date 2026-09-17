// The header BASIC prints at boot, as a serial console shows it.
//
// 2.0 boots straight to BASIC, and BASIC's header is the whole of what a user
// sees before the prompt:
//
//   6502 BIOS v2.0
//   30718 BYTES FREE
//   RAM RTC CF SER VIA SID
//
// Three claims, one per line. The title is the version KernalVersion reports,
// so the two cannot drift. The free-memory count is a number. The hardware line
// names exactly the cards the probe found, in HW_PRESENT's bit order — a line
// that named a card the machine does not have would send a user looking for a
// fault that is not there.
//
// Left aligned, and anchored to the line start: a terminal's width is the
// user's, so there is no column to centre on.
//
// The companion cases: the-header-renders-on-video for the screen, and
// version-agrees-with-the-header for the string in the ROM.

import { coldBoot, BASIC_READY, hardwareLine } from '../lib/boot.mjs'

export const name = 'the header prints the version, free memory and fitted cards on a serial console'

const HW_PRESENT = 0x030d

export async function run(m) {
  const boot = await coldBoot(m, { expect: BASIC_READY })
  const lines = boot.output.split('\n').map((line) => line.trimEnd())

  const title = lines.findIndex((line) => line.startsWith('6502 BIOS v'))
  m.assert(title >= 0, `no header. Console said:\n${boot.output}`)

  const regs = await m.call6502(0xa07b)
  m.assertEqual(lines[title], `6502 BIOS v${regs.A}.${regs.X}`, 'the header title')
  m.assertMatch(lines[title + 1], /^\d+ BYTES FREE$/, 'the line after the title')
  m.assertEqual(lines[title + 2], hardwareLine(await m.peek(HW_PRESENT)), 'the hardware line')

  const ok = lines.findIndex((line) => line === 'OK')
  m.assert(ok > title + 2, `the prompt came before the header had finished:\n${boot.output}`)

  // The logo is drawn on a video console only: nothing but a blank line comes
  // before the title here, and no block characters anywhere.
  m.assert(lines.slice(0, title).every((line) => line === ''), `something came before the title:\n${boot.output}`)
  m.assertNoMatch(boot.output, /[\xdb\xdc\xdf]/, 'the logo\'s block characters')

  // 1.x's BASIC banner is gone, and so is its splash and boot menu.
  m.assertNoMatch(boot.output, /6502 BASIC/, 'the 1.x BASIC banner')
  m.assertNoMatch(boot.output, /ESC=MONITOR/, 'the 1.x boot menu')
}
