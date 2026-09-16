// VDP-PLAN §4.1, the other half: with no PICOVDP, `HW_VID` stays clear and the
// card's records are zero.
//
// The `serial` profile boots with the video slot empty, so this is the probe
// meeting nothing at $9C00 — not the `hw: -video` mask, which clears the bit
// after a probe that found a card. A non-PICOVDP card cannot be faked here:
// `STAT4` is a status register, and `video.setRegister` has no way to change
// what the card identifies as. A TMS9918A is covered once the emulator can fit
// one beside this ROM.

export const name = 'an empty video slot is not video, and records no firmware or capabilities'

const HW_PRESENT = 0x030d
const HW_VID = 0x80
const IO_MODE = 0x0306
const VDP_FW = 0x0394
const VDP_CAPS = 0x0395

export async function run(m) {
  // Poison the records first, so zero afterwards is the probe's answer rather
  // than RAM that was never written.
  await m.write(VDP_FW, [0x55, 0xaa])
  await m.call6502(0xa078) // KernalInit

  m.assertEqual((await m.peek(HW_PRESENT)) & HW_VID, 0, 'HW_VID with the video slot empty')
  m.assertByte(await m.peek(VDP_FW), 0, 'VDP_FW with the video slot empty')
  m.assertByte(await m.peek(VDP_CAPS), 0, 'VDP_CAPS with the video slot empty')
  m.assertByte(await m.peek(IO_MODE), 1, 'IO_MODE: the console is serial')
}
