// VDP-PLAN §7: VLOAD "name", addr copies a file from the current disk into VRAM
// at addr, exactly its length (VdpLoadFile). A name that is not there is
// ?LOAD ERROR, and VRAM is left as it was.

import { describeFixtures } from '../fixtures/build.mjs'
import { typeLine, awaitScreen } from '../lib/video.mjs'

export const name = 'VLOAD streams a file into VRAM, its exact length, and reports a missing one'
export const profile = 'video-cf'

const file = describeFixtures().file('VRAM.BIN')
const AT = 20000
const SENTINEL = 0xee

export async function run(m) {
  await m.fillMem(AT, file.size + 512, SENTINEL, 'vram')
  await typeLine(m, `A$ = "${file.filename}" : VLOAD A$, ${AT - 1000} + 1000 : PRINT "LOADED"`)
  await awaitScreen(m, (s) => s.some((l) => l.startsWith('LOADED')), 'LOADED')
  m.assertBytes(await m.read(AT, file.size, 'vram'), file.bytes, 'the file in VRAM')
  m.assertBytes(await m.read(AT + file.size, 512, 'vram'), new Array(512).fill(SENTINEL), 'VRAM after the file')

  const before = await m.read(0x6000, 64, 'vram')
  await typeLine(m, 'VLOAD "NOPE.BIN", 24576')
  await awaitScreen(m, (s) => s.some((l) => l.startsWith('?LOAD ERROR')), '?LOAD ERROR')
  m.assertBytes(await m.read(0x6000, 64, 'vram'), before, 'VRAM after a failed VLOAD')
}
