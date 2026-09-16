// VDP-PLAN decision 11: a 1.x cartridge runs unchanged on 2.x. `KernalInit`
// leaves the PICOVDP in the legacy submode it resets to, so a cartridge that
// programs the TMS9918 mode registers itself gets the TMS9918 mode it asked for.
//
// The card only honours M1/M2/M3 while `VMODE` is 0. A `KernalInit` that set up
// the Text console would leave `VMODE` at 1, and a cartridge writing Graphics I
// registers would keep a 40x24 text screen with its tables drawn as characters —
// and would have to know about the PICOVDP to get out of it.
//
// So the case is what WIZARDSLAB does at startup, in miniature: call
// `KernalInit`, write registers 0-7 for Graphics I, and look at the card. It
// runs from the prompt, where BASIC has already brought the console up, so it
// also shows a warm `KernalInit` putting the card back rather than only
// declining to change a fresh one. And `KernalInit` must not write the VRAM a
// cartridge is about to fill: the name table is poisoned first and checked after.

import { vram, VID_MODE, VID_TOP } from '../lib/cells.mjs'

export const name = 'KernalInit leaves the card in the legacy submode, and a Graphics I cartridge gets Graphics I'
export const profile = 'video'

const PROGRAM = 0x7e00
const GRAPHICS_I = [0x00, 0xc0, 0x0e, 0x80, 0x00, 0x76, 0x03, 0x04]

// jsr KernalInit / ldx #0 / loop: lda table,x / sta VC_REG / txa / ora #$80 /
// sta VC_REG / inx / cpx #8 / bne loop / rts / table
const code = [
  0x20, 0x78, 0xa0,
  0xa2, 0x00,
  0xbd, 0x17, 0x7e,
  0x8d, 0x01, 0x9c,
  0x8a,
  0x09, 0x80,
  0x8d, 0x01, 0x9c,
  0xe8,
  0xe0, 0x08,
  0xd0, 0xef,
  0x60,
  ...GRAPHICS_I,
]

export async function run(m) {
  m.assertEqual((await m.videoInfo()).mode.vmode, 1, 'the console is up at the prompt before the case starts')

  const poison = Array.from({ length: 0x400 }, (_, i) => (i * 7 + 3) & 0xff)
  await m.write(0, poison, 'vram')
  await m.write(PROGRAM, code)
  await m.call6502(PROGRAM)

  const { mode } = await m.videoInfo()
  m.assertEqual(mode.vmode, 0, 'VMODE after KernalInit')
  m.assertEqual(mode.legacy, 'graphics-i', 'the legacy mode the cartridge selected')
  m.assertEqual(mode.geometry, 'compact', 'the geometry Graphics I gets')

  const registers = await m.videoRegisters()
  m.assertByte(registers[0x13], 0, 'L0SCRX after KernalInit')
  m.assertByte(registers[0x14], 0, 'L0SCRY after KernalInit')
  m.assertByte(registers[0x0f], 0, 'STATSEL_A after KernalInit')
  m.assertByte(await m.peek(VID_MODE), 0, 'VID_MODE after KernalInit: no console set up')
  m.assertByte(await m.peek(VID_TOP), 0, 'VID_TOP after KernalInit')

  m.assertBytes(await vram(m, 0, 0x400), poison, 'VRAM $0000-$03FF across KernalInit')
}
