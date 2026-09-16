// The save-slot format is published twice: as six Kernal routines, and as the
// README's SAVEMGR.BAS, which implements it with nothing but NVRAM statements.
// A game written against either has to be able to read a save the other wrote,
// so the two are held to each other here rather than each to its own idea of
// the format.
//
// The program is read out of the README, not copied into this file — a copy
// would pass while the listing a user actually types in drifted.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  NvStat, NvRead, NvWrite,
  NV_ID, NV_VALID, NV_BAD, NV_SLOT_SIZE, NV_SLOT_DATA,
  SRC, DEST, slotBytes, payloadFor, callNv, lo, hi,
} from '../lib/nvslots.mjs'

export const name = 'SAVEMGR.BAS and the Kernal read each other\'s saves'

const HERE = dirname(fileURLToPath(import.meta.url))
const README = join(HERE, '../../README.md')

function savemgr() {
  const text = readFileSync(README, 'utf8')
  const at = text.indexOf('#### `SAVEMGR.BAS`')
  if (at < 0) throw new Error('the README has no SAVEMGR.BAS section')
  const block = /```basic\n([\s\S]*?)```/.exec(text.slice(at))
  if (!block) throw new Error('the SAVEMGR.BAS section has no ```basic listing')
  return block[1].split('\n').map((l) => l.trim()).filter(Boolean)
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function type(m, lines) {
  for (const line of lines) await m.send(line + '\r', escape(line))
}

export async function run(m) {
  const program = savemgr()
  await m.send('NEW\r', '^OK')
  await type(m, program)

  // The listing as published, run as published, over slots it did not write.
  const image = new Array(256).fill(0)
  image.splice(0, NV_SLOT_SIZE, ...slotBytes(66, payloadFor(0)))
  const damaged = slotBytes(7, payloadFor(1))
  damaged[9] ^= 0x10
  image.splice(NV_SLOT_SIZE, NV_SLOT_SIZE, ...damaged)
  await m.write(0, image, 'nvram')

  const { output: listing } = await m.send('RUN\r', '^OK')
  m.assertNoMatch(listing, /ERROR/, 'SAVEMGR.BAS as published')
  m.assertMatch(listing, /^SLOT ?0 ?: ID ?66 *$/m, 'the listing of the valid slot')
  m.assertMatch(listing, /^SLOT ?1 ?: DAMAGED ID ?7 *$/m, 'the listing of the damaged slot')
  m.assertMatch(listing, /^SLOT ?15 ?: FREE *$/m, 'the listing of a free slot')

  // BASIC writes, the Kernal reads. The driver replaces the demo's lines 10-40
  // and leaves the subroutines as the README has them.
  const payload = Array.from({ length: NV_SLOT_DATA }, (_, k) => (k * 37 + 200) & 0xff)
  await type(m, [
    '10 DIM D(13) : FOR K = 0 TO 13 : D(K) = (K * 37 + 200) AND 255 : NEXT K',
    '20 S = 6 : I = 171 : GOSUB 2000',
    '30 END',
    '40 REM',
  ])
  await m.send('RUN\r', '^OK')
  const s = await callNv(m, NvStat, { X: 6 })
  m.assertByte(s.A, NV_VALID, 'NvStat of the slot SAVEMGR.BAS wrote')
  m.assertByte(s.Y, 171, 'the owner ID SAVEMGR.BAS wrote')
  const r = await callNv(m, NvRead, { X: 6, A: lo(DEST), Y: hi(DEST) })
  m.assertEqual(r.carry, false, 'NvRead of the slot SAVEMGR.BAS wrote: carry')
  m.assertBytes(await m.read(DEST, NV_SLOT_DATA), payload, 'the payload SAVEMGR.BAS wrote')

  // The Kernal writes, BASIC reads.
  await m.write(SRC, payloadFor(11))
  await m.write(NV_ID, 205)
  m.assertEqual((await callNv(m, NvWrite, { X: 11, A: lo(SRC), Y: hi(SRC) })).carry, false, 'NvWrite: carry')
  await type(m, [
    '10 DIM D(13) : S = 11 : GOSUB 3000',
    '20 PRINT "T=";T;"I=";I',
    '30 FOR K = 0 TO 13 : PRINT D(K) : NEXT K',
    '40 END',
  ])
  const { output: read } = await m.send('RUN\r', '^OK')
  m.assertMatch(read, /^T= ?1 ?I= ?205 *$/m, 'SAVEMGR.BAS status of the slot NvWrite wrote')
  const values = [...read.matchAll(/^ ?(\d+) *$/gm)].map((x) => Number(x[1]))
  m.assertEqual(values.join(','), payloadFor(11).join(','), 'the payload SAVEMGR.BAS read')

  // And both call the same slot damaged.
  await m.write(11 * NV_SLOT_SIZE + 5, (await m.peek(11 * NV_SLOT_SIZE + 5, 'nvram')) ^ 0x01, 'nvram')
  const { output: bad } = await m.send('RUN\r', '^OK')
  m.assertMatch(bad, /^T= ?2 ?I= ?205 *$/m, 'SAVEMGR.BAS status of a damaged slot')
  m.assertByte((await callNv(m, NvStat, { X: 11 })).A, NV_BAD, 'NvStat of the same damaged slot')
}
