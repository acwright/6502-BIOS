// VDP-PLAN §7: SPRITE n,x,y,pattern[,attr] writes sprite n's four attribute
// bytes at $2000 + 4n — Y, X bits 7:0, pattern, attributes with X bit 8 in b7
// (SPEC §10) — and takes the console out of Text mode, so the prompt after it
// clears the screen.
//
// The sprite table is outside everything InitVideo and CLS touch, so the bytes
// are still there to read once the prompt is back.

import { typeLine, awaitScreen, render } from '../lib/video.mjs'

export const name = 'SPRITE writes four bytes at $2000 + 4n, with x bit 8 in the attributes'
export const profile = 'video'

const TABLE = 0x2000

export async function run(m) {
  await m.fillMem(TABLE, 256, 0xee, 'vram')
  await typeLine(m, 'N = 5 : SPRITE N, 300, 100, 7, 3 : SPRITE 63, 511, 255, 255, 127 : SPRITE 0, 44, 1, 2 : PRINT "SPRITES"')
  const screen = await awaitScreen(m, (s) => s.some((l) => l.startsWith('OK')), 'OK after the SPRITEs')
  m.assertBytes(await m.read(TABLE + 4 * 5, 4, 'vram'), [100, 44, 7, 0x83], 'SPRITE 5, 300, 100, 7, 3')
  m.assertBytes(await m.read(TABLE + 4 * 63, 4, 'vram'), [255, 255, 255, 0xff], 'SPRITE 63, 511, 255, 255, 127')
  m.assertBytes(await m.read(TABLE, 4, 'vram'), [1, 44, 2, 0x00], 'SPRITE 0, 44, 1, 2 — attributes default to 0')
  m.assertEqual((await m.read(TABLE, 256, 'vram')).filter((b) => b === 0xee).length, 244, 'untouched bytes in the table')
  // Disturbed, so the prompt cleared the screen: the line typed is gone.
  m.assert(!screen.some((l) => l.includes('SPRITES')), `the prompt after SPRITE did not restore the console:\n${render(screen)}`)
}
