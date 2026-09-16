// README § NVRAM Save Slots: NvErase zeroes all 16 bytes of a slot, not just
// the owner ID, so a deleted save is not left legible to whatever game next
// takes the slot. NvFormat does that to all sixteen.

import {
  NvStat, NvWrite, NvErase, NvFormat,
  NV_ID, NV_EMPTY, NV_SLOT_SIZE,
  RTC_CTRL_B, BME, SRC, BACKGROUND, payloadFor, callNv, lo, hi,
} from '../lib/nvslots.mjs'

export const name = 'NvErase and NvFormat leave no save bytes behind'

export async function run(m) {
  const slot = 9
  const base = slot * NV_SLOT_SIZE

  await m.write(0, BACKGROUND, 'nvram')
  await m.write(SRC, payloadFor(slot))
  await m.write(NV_ID, 0x5c)
  m.assertEqual((await callNv(m, NvWrite, { X: slot, A: lo(SRC), Y: hi(SRC) })).carry, false, 'NvWrite: carry')

  const e = await callNv(m, NvErase, { X: slot })
  m.assertEqual(e.carry, false, 'NvErase: carry')
  m.assertByte(e.X, slot, 'NvErase: X preserved')

  const expected = [...BACKGROUND]
  expected.fill(0, base, base + NV_SLOT_SIZE)
  m.assertBytes(await m.read(0, 256, 'nvram'), expected, `NVRAM after NvErase of slot ${slot}`)

  const s = await callNv(m, NvStat, { X: slot })
  m.assertByte(s.A, NV_EMPTY, 'NvStat of the erased slot')

  const f = await callNv(m, NvFormat)
  m.assertEqual(f.carry, false, 'NvFormat: carry')
  m.assertBytes(await m.read(0, 256, 'nvram'), new Array(256).fill(0), 'NVRAM after NvFormat')

  m.assertEqual((await m.peek(RTC_CTRL_B)) & BME, 0, 'BME after NvFormat')
}
