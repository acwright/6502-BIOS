// The boot splash, as a user with a video card sees it.
//
// README step 8 shows it as two centred lines on a 40-column screen:
//
//     -- 6502 BIOS v1.3 --
//   ENTER=BASIC  ESC=MONITOR
//
// The companion case, version-agrees-with-splash, checks the string in the ROM
// against KernalVersion. This one checks that the string actually reaches the
// screen, which is a different failure — a correct string nobody ever draws
// would pass that case and fail every user.

export const name = 'the boot splash renders centred on a video console'
export const profile = 'video'

const COLUMNS = 40
const MENU = 'ENTER=BASIC  ESC=MONITOR'

// The splash is up from early boot until the ~5 s menu timeout auto-boots BASIC
// and clears the screen, so look in bounded steps and stop at the first sight of
// it rather than landing on one fixed cycle count.
const STEP_CYCLES = 500000
const STEPS = 8

export async function run(m) {
  await m.reset(true)
  await m.start()

  let lines = null
  for (let i = 0; i < STEPS && !lines; i++) {
    await m.waitFor({ cycles: STEP_CYCLES, run: 'turbo', timeoutMs: 30000 })
    const screen = await m.screenText()
    if (screen.some((line) => line.includes('-- 6502 BIOS v'))) lines = screen
  }
  m.assert(lines, `the splash never appeared within ${STEPS * STEP_CYCLES} cycles`)

  const title = lines.find((line) => line.includes('-- 6502 BIOS v'))
  const menu = lines.find((line) => line.includes(MENU))
  m.assert(menu, `the boot menu line is not on screen. Screen:\n${lines.join('\n')}`)

  // The version on screen is the version the Kernal reports.
  const regs = await m.call6502(0xa07b)
  m.assertEqual(title.trim(), `-- 6502 BIOS v${regs.A}.${regs.X} --`, 'the splash title')
  m.assertEqual(menu.trim(), MENU, 'the boot menu')

  for (const [what, line] of [['title', title], ['menu', menu]]) {
    m.assertEqual(line.length, COLUMNS, `the ${what} line's width`)
    // Centred to the column, which is what "(40-24)/2 = 8" in the ROM means.
    const left = line.length - line.trimStart().length
    m.assertEqual(left, Math.floor((COLUMNS - line.trim().length) / 2), `the ${what}'s left margin`)
  }
}
