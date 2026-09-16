// VDP-PLAN §7 and decision 3: NVSAVE slot,id,addr / NVLOAD slot,addr /
// NVERASE slot / NVSTAT(slot) / NVFIND(id) are the Kernal's save slots from
// BASIC. What NVSAVE writes is checked against the README's slot format
// (lib/nvslots.mjs), not only read back through NVLOAD, so a pair that agreed
// on the wrong layout fails.

import {
  NV_SLOT_SIZE, NV_SLOT_DATA, BACKGROUND, slotBytes,
} from '../lib/nvslots.mjs'

export const name = 'NVSAVE, NVLOAD, NVERASE, NVSTAT and NVFIND round-trip a save slot in the published format'
export const profile = 'nvram'

const SRC = 4096
const DEST = 8192
const OVERRUN = 0xee

async function basic(m, line) {
  const { output } = await m.send(`${line}\r`, '^OK')
  m.assertNoMatch(output, /ERROR/, line)
  return output
}

async function printed(m, expression) {
  const output = await basic(m, `PRINT ${expression}`)
  const value = /^ ?(-?\d+) *$/m.exec(output)
  m.assert(value, `PRINT ${expression} printed no number: ${JSON.stringify(output)}`)
  return Number(value[1])
}

export async function run(m) {
  const payload = Array.from({ length: NV_SLOT_DATA }, (_, i) => (i * 53 + 7) & 0xff)
  await m.write(0, BACKGROUND, 'nvram')
  await m.write(SRC, payload)

  // Slot 9, owner 66, the payload from an expression's address.
  await basic(m, `A = ${SRC - 96} : NVSAVE 3 * 3, 60 + 6, A + 96`)
  const expected = [...BACKGROUND]
  expected.splice(9 * NV_SLOT_SIZE, NV_SLOT_SIZE, ...slotBytes(66, payload))
  m.assertBytes(await m.read(0, 256, 'nvram'), expected, 'NVRAM after NVSAVE 9, 66')

  m.assertEqual(await printed(m, 'NVSTAT(9)'), 1, 'NVSTAT(9) after NVSAVE')
  m.assertEqual(await printed(m, 'NVRAM(9 * 16)'), 66, 'the owner ID, as NVRAM(slot*16)')
  m.assertEqual(await printed(m, 'NVFIND(66)'), 9, 'NVFIND(66)')

  await m.fillMem(DEST, NV_SLOT_DATA + 1, OVERRUN)
  await basic(m, `NVLOAD 9, ${DEST}`)
  m.assertBytes(await m.read(DEST, NV_SLOT_DATA), payload, 'the payload NVLOAD copied')
  m.assertByte(await m.peek(DEST + NV_SLOT_DATA), OVERRUN, 'the byte after the 14 NVLOAD copied')

  // The background's owner bytes are all non-zero, so nothing is free yet and
  // an unknown ID is not found either.
  m.assertEqual(await printed(m, 'NVFIND(0)'), -1, 'NVFIND(0) with no free slot')
  m.assertEqual(await printed(m, 'NVFIND(250)'), -1, 'NVFIND of an ID no slot has')

  // Damaged: NVSTAT says so, and NVLOAD refuses without copying.
  await m.write(9 * NV_SLOT_SIZE + 5, [payload[3] ^ 0x40], 'nvram')
  m.assertEqual(await printed(m, 'NVSTAT(9)'), 2, 'NVSTAT(9) with a payload byte changed')
  await m.fillMem(DEST, NV_SLOT_DATA, OVERRUN)
  const { output } = await m.send(`NVLOAD 9, ${DEST}\r`, '^OK')
  m.assertMatch(output, /^\?LOAD ERROR$/m, 'NVLOAD of a damaged slot')
  m.assertBytes(await m.read(DEST, NV_SLOT_DATA), new Array(NV_SLOT_DATA).fill(OVERRUN), 'the buffer after a refused NVLOAD')

  // Erased: all 16 bytes zero, free, and the lowest free slot.
  await basic(m, 'NVERASE 9')
  m.assertBytes(await m.read(9 * NV_SLOT_SIZE, NV_SLOT_SIZE, 'nvram'), new Array(NV_SLOT_SIZE).fill(0), 'slot 9 after NVERASE')
  m.assertEqual(await printed(m, 'NVSTAT(9)'), 0, 'NVSTAT(9) after NVERASE')
  m.assertEqual(await printed(m, 'NVFIND(0)'), 9, 'NVFIND(0) after NVERASE 9')
  const free = await m.send(`NVLOAD 9, ${DEST}\r`, '^OK')
  m.assertMatch(free.output, /^\?LOAD ERROR$/m, 'NVLOAD of a free slot')
}
