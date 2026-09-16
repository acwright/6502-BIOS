// VDP-PLAN §7: VSYNC waits for the start of the next vertical blank. In a loop
// that is one pass a frame: each VSYNC begins a few lines into the blank the
// last one returned in, and has to wait a whole frame for the next.
//
// A breakpoint on the WaitVBlank slot, which the statement runs, marks each
// VSYNC. The first is wherever the frame happened to be, and so is how long it
// waited; after that each begins inside the blank the last one returned at the
// start of — a GOTO's worth of lines past 192 — and one frame after it.

export const name = 'VSYNC in a loop runs once a frame, at the start of vertical blanking'
export const profile = 'video'

import { typeProgram, typeLine } from '../lib/video.mjs'

const WaitVBlank = 0xa0c3
const ACTIVE_LINES = 192

export async function run(m) {
  await typeProgram(m, ['10 VSYNC : GOTO 10'])
  await m.clearBreaks()
  await m.breakAt(WaitVBlank)
  await typeLine(m, 'RUN')

  // The first wait does not pass `run`: the machine may already have stopped.
  let result = await m.waitFor({ stopped: true, timeoutMs: 30000 })
  let previous = null
  for (let pass = 0; pass < 5; pass++) {
    if (pass > 0) {
      await m.step() // off the breakpoint, which would otherwise stop the run at once
      result = await m.waitFor({ stopped: true, run: 'turbo', timeoutMs: 30000 })
    }
    m.assertEqual(result.stop?.kind, 'breakpoint', `pass ${pass}: the stop`)
    const cycles = await m.cycles()
    const line = (await m.videoInfo()).displayLine
    // Pass 1 follows the first wait, which was for less than a frame.
    if (pass > 0) {
      m.assert(line >= ACTIVE_LINES && line < ACTIVE_LINES + 32, `pass ${pass}: VSYNC began on display line ${line}`)
    }
    if (pass > 1) {
      const frame = cycles - previous
      m.assert(frame > 10000 && frame < 25000, `pass ${pass}: ${frame} cycles since the last VSYNC, not one frame`)
    }
    previous = cycles
  }
  await m.clearBreaks()
}
