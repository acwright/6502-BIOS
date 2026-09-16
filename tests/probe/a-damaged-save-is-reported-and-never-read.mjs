// A save the checksum rejects has to be told apart from no save at all, and must
// never reach the game's buffer.
//
// README § NVRAM Save Slots: NvStat reports free, valid or damaged with the
// owner ID; NvRead copies only a valid slot, and on any failure leaves the
// buffer untouched and still returns the status and owner, so a game can say
// "your save is damaged" rather than silently starting over. NvFind matches a
// damaged slot as well as a valid one, and returns the lowest.
//
// The image is prepared rather than written through the Kernal, so every
// assertion here reads state the routines under test did not create.

import {
  NvStat, NvRead, NvFind,
  NV_EMPTY, NV_VALID, NV_BAD, NV_SLOTS, NV_SLOT_SIZE, NV_SLOT_DATA,
  DEST, slotBytes, payloadFor, checksum, callNv, lo, hi, hex,
} from '../lib/nvslots.mjs'

export const name = 'a damaged save is reported as damaged, found by NvFind, and never copied'

const SENTINEL = 0xee

export async function run(m) {
  const image = new Array(256).fill(0)
  const put = (slot, bytes) => image.splice(slot * NV_SLOT_SIZE, NV_SLOT_SIZE, ...bytes)

  // 0  valid, owner $10
  // 1  damaged, owner $42 — its checksum is off by one
  // 2  free, with payload left behind: the owner ID alone decides
  // 3  valid, owner $42 — the same owner as the damaged slot below it
  // 4  damaged by two transposed payload bytes, which a plain sum would pass
  // 5  every byte $FF, the shape of an unpowered or erased part
  // 6+ free
  put(0, slotBytes(0x10, payloadFor(0)))
  const damaged = slotBytes(0x42, payloadFor(1))
  damaged[1] = (damaged[1] + 1) & 0xff
  put(1, damaged)
  put(2, [0, 0x99, ...payloadFor(2)])
  put(3, slotBytes(0x42, payloadFor(3)))
  const transposed = slotBytes(0x77, payloadFor(4))
  ;[transposed[2], transposed[3]] = [transposed[3], transposed[2]]
  m.assert(transposed[2] !== transposed[3], 'the transposed bytes differ')
  put(4, transposed)
  put(5, new Array(NV_SLOT_SIZE).fill(0xff))
  m.assert(checksum(0xff, new Array(NV_SLOT_DATA).fill(0xff)) !== 0xff, 'an all-$FF slot fails its checksum')
  await m.write(0, image, 'nvram')

  const want = [
    [0, NV_VALID, 0x10],
    [1, NV_BAD, 0x42],
    [2, NV_EMPTY, 0x00],
    [3, NV_VALID, 0x42],
    [4, NV_BAD, 0x77],
    [5, NV_BAD, 0xff],
    [15, NV_EMPTY, 0x00],
  ]
  for (const [slot, status, owner] of want) {
    const s = await callNv(m, NvStat, { X: slot })
    m.assertEqual(s.carry, false, `NvStat of slot ${slot}: carry`)
    m.assertByte(s.A, status, `NvStat of slot ${slot}: status`)
    m.assertByte(s.Y, owner, `NvStat of slot ${slot}: owner ID`)
    m.assertByte(s.X, slot, `NvStat of slot ${slot}: X preserved`)

    await m.fillMem(DEST, NV_SLOT_DATA, SENTINEL)
    const r = await callNv(m, NvRead, { X: slot, A: lo(DEST), Y: hi(DEST) })
    m.assertByte(r.A, status, `NvRead of slot ${slot}: status`)
    m.assertByte(r.Y, owner, `NvRead of slot ${slot}: owner ID`)
    m.assertByte(r.X, slot, `NvRead of slot ${slot}: X preserved`)
    m.assertEqual(r.carry, status !== NV_VALID, `NvRead of slot ${slot}: carry`)
    if (status !== NV_VALID) {
      m.assertBytes(
        await m.read(DEST, NV_SLOT_DATA),
        new Array(NV_SLOT_DATA).fill(SENTINEL),
        `the buffer after NvRead of ${status === NV_BAD ? 'damaged' : 'free'} slot ${slot} — it was written`,
      )
    }
  }

  const find = async (owner, slot, what) => {
    const f = await callNv(m, NvFind, { A: owner })
    if (slot == null) {
      m.assertEqual(f.carry, true, `NvFind(${hex(owner)}) ${what}: carry`)
    } else {
      m.assertEqual(f.carry, false, `NvFind(${hex(owner)}) ${what}: carry`)
      m.assertByte(f.X, slot, `NvFind(${hex(owner)}) ${what}: slot`)
    }
  }
  await find(0x42, 1, 'with a damaged save below a valid one')
  await find(0x10, 0, 'in slot 0')
  await find(0x77, 4, 'on a damaged save')
  await find(0x00, 2, 'for the first free slot')
  await find(0x55, null, 'for an owner with no save')

  // A full area has no free slot to find.
  for (let slot = 0; slot < NV_SLOTS; slot++) put(slot, slotBytes(0x80 + slot, payloadFor(slot)))
  await m.write(0, image, 'nvram')
  await find(0x00, null, 'with every slot taken')
  await find(0x8f, 15, 'in the last slot')
}
