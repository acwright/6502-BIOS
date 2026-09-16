// VDP-PLAN §6, $A0C0: `VdpSetPalette` writes entry X as `$0R $GB` at
// $FC00 + 2X, and the card draws with it (SPEC §11: the palette cache takes a
// VRAM write there at once). Entry 200 is past the first page, so the carry
// into the address's high byte is exercised.

import { vdpCall, VdpSetPalette } from '../lib/vdp.mjs'

export const name = 'VdpSetPalette writes an entry at $FC00 + 2X and the card uses it'
export const profile = 'video'

const VBANK = 0x08

export async function run(m) {
  for (const [entry, r, gb] of [[5, 0x0a, 0xbc], [200, 0x03, 0x4f]]) {
    const address = 0xfc00 + 2 * entry
    const result = await vdpCall(m, VdpSetPalette, { X: entry, A: r, Y: gb })
    m.assert(!result.carry, `carry set for entry ${entry}`)
    m.assertBytes(await m.read(address, 2, 'vram'), [r, gb], `VRAM at $${address.toString(16).toUpperCase()}`)
    const { entries } = await m.call('video.palette')
    m.assertWord(entries[entry], (r << 8) | gb, `the card's palette entry ${entry}`)
    m.assertByte((await m.videoRegisters())[VBANK], 0, `VBANK after entry ${entry}`)
  }
}
