// VDP-PLAN §5 Phase 5 and §6, $A0C6: `VdpLoadFile` streams a named file into
// VRAM and writes **exactly** its size. A RAM load rounds up to the sector;
// a VRAM load must not, or loading a table would overwrite the start of the
// next one with the rest of the card's sector.
//
// The fixture is 1000 bytes: two sectors, the second holding 24 bytes of file
// and 488 of the card's zeros. It goes to $3E80, so it also runs from VRAM
// bank 0 into bank 1 through the pointer's own carry. Every byte around it is
// a sentinel, and the one straight after it is the claim.

import { describeFixtures } from '../fixtures/build.mjs'
import { vdpCall, VdpLoadFile } from '../lib/vdp.mjs'

export const name = 'VdpLoadFile writes exactly the file into VRAM, across a bank, and nothing after it'
export const profile = 'video-cf'

const STR_PTR = 0x0002
const FS_IO_ADDR = 0x037f
const FS_FILE_SIZE = 0x034a
const NAME = 0x7e00
const VBANK = 0x08

const file = describeFixtures().file('VRAM.BIN')
const AT = 0x3e80
const SENTINEL = 0xee

async function load(m, filename, address) {
  await m.write(NAME, [...Buffer.from(filename, 'ascii'), 0])
  await m.write(STR_PTR, [NAME & 0xff, NAME >> 8])
  await m.write(FS_IO_ADDR, [address & 0xff, address >> 8])
  return vdpCall(m, VdpLoadFile, {}, { timeoutMs: 20000 })
}

export async function run(m) {
  m.assertEqual(file.size, 1000, 'the fixture\'s size')
  await m.fillMem(AT - 16, 16 + file.size + 1024, SENTINEL, 'vram')

  const r = await load(m, file.filename, AT)
  m.assert(!r.carry, 'carry set loading VRAM.BIN')
  m.assertWord(await m.peekWord(FS_FILE_SIZE), file.size, 'FS_FILE_SIZE')
  m.assertBytes(await m.read(AT, file.size, 'vram'), file.bytes, 'the file in VRAM')
  m.assertBytes(await m.read(AT - 16, 16, 'vram'), new Array(16).fill(SENTINEL), 'the bytes before it')
  m.assertByte(await m.peek(AT + file.size, 'vram'), SENTINEL, 'VRAM byte 1000, straight after the file')
  m.assertBytes(await m.read(AT + file.size, 1024, 'vram'), new Array(1024).fill(SENTINEL), 'the rest of the second sector\'s worth after it')
  m.assertByte((await m.videoRegisters())[VBANK], 0, 'VBANK after the load')

  // A name that is not on the card: carry, and VRAM as it was.
  const before = await m.read(0x6000, 64, 'vram')
  const missing = await load(m, 'NOPE.BIN', 0x6000)
  m.assert(missing.carry, 'carry clear for a file that is not there')
  m.assertBytes(await m.read(0x6000, 64, 'vram'), before, 'VRAM after a failed load')
}
