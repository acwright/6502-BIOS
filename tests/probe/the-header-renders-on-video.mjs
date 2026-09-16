// The header BASIC prints at boot, as a user with a video card sees it.
//
// The same three lines as on a serial console — title, free memory, fitted
// cards — on a screen BASIC cleared first, left aligned, with the prompt after
// them. The hardware line names the video card here, which the serial profile's
// machine does not have.
//
// The companion case, version-agrees-with-the-header, checks the string in the
// ROM against KernalVersion. This one checks that the string actually reaches
// the screen, which is a different failure — a correct string nobody ever draws
// would pass that case and fail every user.

import { hardwareLine } from '../lib/boot.mjs'

export const name = 'the header renders on a video console'
export const profile = 'video'

const HW_PRESENT = 0x030d

// No serial output to wait on: step emulated time until the prompt is on screen.
const STEP_CYCLES = 250000
const STEPS = 16

export async function run(m) {
  await m.reset(true)
  await m.start()

  let lines = null
  for (let i = 0; i < STEPS && !lines; i++) {
    await m.waitFor({ cycles: STEP_CYCLES, run: 'turbo', timeoutMs: 30000 })
    const screen = await m.screenText()
    if (screen.some((line) => line.startsWith('OK'))) lines = screen.map((line) => line.trimEnd())
  }
  m.assert(lines, `the prompt never appeared within ${STEPS * STEP_CYCLES} cycles`)

  const title = lines.findIndex((line) => line.startsWith('6502 BIOS v'))
  m.assert(title >= 0, `the header is not on screen. Screen:\n${lines.join('\n')}`)

  const regs = await m.call6502(0xa07b)
  const present = await m.peek(HW_PRESENT)
  m.assertEqual(lines[title], `6502 BIOS v${regs.A}.${regs.X}`, 'the header title')
  m.assertMatch(lines[title + 1], /^\d+ BYTES FREE$/, 'the line after the title')
  m.assertEqual(lines[title + 2], hardwareLine(present), 'the hardware line')
  m.assertMatch(lines[title + 2], /\bVDP$/, 'the hardware line names the video card')

  // Cleared before the header, so nothing from before the boot is left above it.
  for (let row = 0; row < title; row++) {
    m.assertEqual(lines[row], '', `row ${row} above the header`)
  }
  m.assert(
    lines.findIndex((line) => line.startsWith('OK')) > title + 2,
    `the prompt is not below the header. Screen:\n${lines.join('\n')}`,
  )
}
