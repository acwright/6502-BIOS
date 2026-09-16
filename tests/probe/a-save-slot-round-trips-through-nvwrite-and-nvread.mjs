// README § NVRAM Save Slots: slot n is NVRAM n*16 to n*16+15 — owner ID,
// checksum, then 14 payload bytes.
//
// A slot written and read back through the Kernal proves the pair agree with
// each other, which a routine that consistently used the wrong address would
// also do. So the bytes are read out of the chip as well, against the format
// the README publishes, over an NVRAM image in which every byte differs: a slot
// that landed one byte or one slot off, or a burst that ran past sixteen,
// leaves a mark somewhere in the other 240.
//
// Slots 0 and 15 are the ends a bad shift survives in the middle and fails at.

import {
  NvStat, NvRead, NvWrite, NvErase, RtcReadNVRAM,
  NV_ID, NV_VALID, NV_SLOT_SIZE, NV_SLOT_DATA,
  RTC_CTRL_B, RTC_RAM_ADDR, TE, BME,
  SRC, DEST, BACKGROUND, slotBytes, payloadFor, callNv, lo, hi, hex,
} from '../lib/nvslots.mjs'

export const name = 'a save slot round-trips through NvWrite and NvRead, on exactly its own 16 bytes'

const OVERRUN = 0xee

export async function run(m) {
  for (const slot of [0, 7, 15]) {
    const payload = payloadFor(slot)
    const id = 0x40 + slot
    const base = slot * NV_SLOT_SIZE

    await m.write(0, BACKGROUND, 'nvram')
    await m.write(SRC, payload)
    await m.write(NV_ID, id)

    const w = await callNv(m, NvWrite, { X: slot, A: lo(SRC), Y: hi(SRC) })
    m.assertEqual(w.carry, false, `NvWrite to slot ${slot}: carry`)
    m.assertByte(w.X, slot, `NvWrite to slot ${slot}: X preserved`)

    const expected = [...BACKGROUND]
    expected.splice(base, NV_SLOT_SIZE, ...slotBytes(id, payload))
    m.assertBytes(await m.read(0, 256, 'nvram'), expected, `NVRAM after NvWrite to slot ${slot}`)

    const s = await callNv(m, NvStat, { X: slot })
    m.assertEqual(s.carry, false, `NvStat of slot ${slot}: carry`)
    m.assertByte(s.A, NV_VALID, `NvStat of slot ${slot}: status`)
    m.assertByte(s.Y, id, `NvStat of slot ${slot}: owner ID`)
    m.assertByte(s.X, slot, `NvStat of slot ${slot}: X preserved`)

    await m.fillMem(DEST, NV_SLOT_DATA + 1, OVERRUN)
    const r = await callNv(m, NvRead, { X: slot, A: lo(DEST), Y: hi(DEST) })
    m.assertEqual(r.carry, false, `NvRead of slot ${slot}: carry`)
    m.assertByte(r.A, NV_VALID, `NvRead of slot ${slot}: status`)
    m.assertByte(r.Y, id, `NvRead of slot ${slot}: owner ID`)
    m.assertByte(r.X, slot, `NvRead of slot ${slot}: X preserved`)
    m.assertBytes(await m.read(DEST, NV_SLOT_DATA), payload, `the payload NvRead copied from slot ${slot}`)
    m.assertByte(await m.peek(DEST + NV_SLOT_DATA), OVERRUN, `the byte after the buffer — NvRead copied more than ${NV_SLOT_DATA}`)
  }

  // Burst mode is off again, so the raw single-byte pair is as documented: a
  // read leaves the address latch on the byte it named rather than one past it.
  const controlB = await m.peek(RTC_CTRL_B)
  m.assertEqual(controlB & BME, 0, `BME after the slot calls (Control B = ${hex(controlB)})`)
  m.assertEqual(controlB & TE, TE, `TE after the slot calls (Control B = ${hex(controlB)})`)
  const { A } = await callNv(m, RtcReadNVRAM, { X: 0x21 })
  m.assertByte(A, BACKGROUND[0x21], 'RtcReadNVRAM of $21 after the slot calls')
  m.assertByte(await m.peek(RTC_RAM_ADDR), 0x21, 'the NVRAM address latch after RtcReadNVRAM — it moved')

  // Carry set means the call did nothing: past the last slot, and an owner ID of
  // zero, which is how a free slot is marked and so is NvErase's job.
  await m.write(0, BACKGROUND, 'nvram')
  await m.write(SRC, payloadFor(3))

  await m.write(NV_ID, 0x42)
  const past = await callNv(m, NvWrite, { X: 16, A: lo(SRC), Y: hi(SRC) })
  m.assertEqual(past.carry, true, 'NvWrite to slot 16: carry')

  await m.write(NV_ID, 0)
  const zero = await callNv(m, NvWrite, { X: 3, A: lo(SRC), Y: hi(SRC) })
  m.assertEqual(zero.carry, true, 'NvWrite with NV_ID = 0: carry')
  m.assertByte(zero.X, 3, 'NvWrite with NV_ID = 0: X preserved')

  m.assertEqual((await callNv(m, NvStat, { X: 16 })).carry, true, 'NvStat of slot 16: carry')
  m.assertEqual((await callNv(m, NvErase, { X: 16 })).carry, true, 'NvErase of slot 16: carry')
  await m.fillMem(DEST, NV_SLOT_DATA, OVERRUN)
  m.assertEqual((await callNv(m, NvRead, { X: 16, A: lo(DEST), Y: hi(DEST) })).carry, true, 'NvRead of slot 16: carry')
  m.assertBytes(await m.read(DEST, NV_SLOT_DATA), new Array(NV_SLOT_DATA).fill(OVERRUN), 'the buffer NvRead of slot 16 was given')

  m.assertBytes(await m.read(0, 256, 'nvram'), BACKGROUND, 'NVRAM after the calls that should have done nothing')
}
