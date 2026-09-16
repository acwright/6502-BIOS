// README § NVRAM Save Slots: the caller's decimal and interrupt flags come back
// unchanged.
//
// Decimal mode is the one that bites. The checksum's rotate is `asl` / `adc #0`,
// and with D set the `adc` is a BCD add: the checksum comes out different, so a
// game that keeps its score in decimal mode would write saves it could never
// read back. The routines clear D for themselves; this checks they do, and that
// the caller's D is still set on the way out.
//
// Interrupts are masked for the burst copy, and must be unmasked again if they
// were on — or a game's IRQ-driven music stops the first time it saves.

import {
  NvStat, NvRead, NvWrite, NvErase, NvFind, NvFormat,
  NV_ID, NV_VALID, NV_SLOT_SIZE, NV_SLOT_DATA, FLAG_D, FLAG_I,
  SRC, DEST, slotBytes, payloadFor, callNv, lo, hi, hex,
} from '../lib/nvslots.mjs'

export const name = 'the save-slot routines hand back the caller\'s decimal and interrupt flags'

export async function run(m) {
  const slot = 5
  const id = 0x99
  const payload = payloadFor(slot)
  await m.write(SRC, payload)
  await m.write(NV_ID, id)

  for (const P of [FLAG_D, FLAG_D | FLAG_I, 0, FLAG_I]) {
    const as = `P = ${hex(P)}`
    const kept = (r, what) => {
      m.assertEqual(r.P & FLAG_D, P & FLAG_D, `${what} with ${as}: D on return`)
      m.assertEqual(r.P & FLAG_I, P & FLAG_I, `${what} with ${as}: I on return`)
    }

    await m.write(0, new Array(256).fill(0), 'nvram')

    const w = await callNv(m, NvWrite, { X: slot, A: lo(SRC), Y: hi(SRC), P })
    m.assertEqual(w.carry, false, `NvWrite with ${as}: carry`)
    kept(w, 'NvWrite')
    m.assertBytes(
      await m.read(slot * NV_SLOT_SIZE, NV_SLOT_SIZE, 'nvram'),
      slotBytes(id, payload),
      `the slot NvWrite wrote with ${as} — the checksum was computed in decimal mode`,
    )

    const s = await callNv(m, NvStat, { X: slot, P })
    m.assertByte(s.A, NV_VALID, `NvStat with ${as}: status`)
    kept(s, 'NvStat')

    const r = await callNv(m, NvRead, { X: slot, A: lo(DEST), Y: hi(DEST), P })
    m.assertEqual(r.carry, false, `NvRead with ${as}: carry`)
    m.assertBytes(await m.read(DEST, NV_SLOT_DATA), payload, `the payload NvRead copied with ${as}`)
    kept(r, 'NvRead')

    kept(await callNv(m, NvFind, { A: id, P }), 'NvFind')
    kept(await callNv(m, NvErase, { X: slot, P }), 'NvErase')
    kept(await callNv(m, NvFormat, { P }), 'NvFormat')
    // And on a failure path, which leaves by a different exit.
    const past = await callNv(m, NvStat, { X: 16, P })
    m.assertEqual(past.carry, true, `NvStat of slot 16 with ${as}: carry`)
    kept(past, 'NvStat of slot 16')
  }
}
