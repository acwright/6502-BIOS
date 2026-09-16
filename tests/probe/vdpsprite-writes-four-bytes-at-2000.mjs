// VDP-PLAN §6, $A0CC: `VdpSprite` writes sprite n's four attribute bytes —
// Y, X, pattern, attributes (SPEC §10) — from `VDP_P0`-`VDP_P3` at
// $2000 + 4n, where `SCREEN` 1-3 put the table. It keeps X, marks `VID_MODE`
// disturbed so BASIC restores the console, and refuses slot 64.

import { vdpCall, VdpSprite, VDP_P0 } from '../lib/vdp.mjs'
import { VID_MODE } from '../lib/cells.mjs'

export const name = 'VdpSprite writes a sprite\'s four bytes at $2000 + 4n and marks the console disturbed'
export const profile = 'video'

const TABLE = 0x2000

export async function run(m) {
  await m.fillMem(TABLE, 256, 0x00, 'vram')

  for (const [slot, bytes] of [[0, [0x11, 0x22, 0x33, 0x44]], [5, [0x80, 0x7f, 0x12, 0x85]], [63, [0xef, 0x01, 0xff, 0x0f]]]) {
    await m.write(VDP_P0, bytes)
    const r = await vdpCall(m, VdpSprite, { X: slot })
    m.assert(!r.carry, `sprite ${slot}: carry set`)
    m.assertByte(r.X, slot, `sprite ${slot}: X preserved`)
    m.assertBytes(await m.read(TABLE + 4 * slot, 4, 'vram'), bytes, `sprite ${slot}'s attribute bytes`)
  }
  m.assertByte(await m.peek(VID_MODE), 0x81, 'VID_MODE after VdpSprite')
  m.assertEqual((await m.read(TABLE, 256, 'vram')).filter((b) => b !== 0).length, 12, 'bytes written in the table: three sprites\' worth')

  await m.write(VDP_P0, [0xaa, 0xaa, 0xaa, 0xaa])
  const before = await m.read(TABLE, 512, 'vram')
  const refused = await vdpCall(m, VdpSprite, { X: 64 })
  m.assert(refused.carry, 'carry clear for sprite 64')
  m.assertBytes(await m.read(TABLE, 512, 'vram'), before, 'the table after sprite 64 was refused')
}
